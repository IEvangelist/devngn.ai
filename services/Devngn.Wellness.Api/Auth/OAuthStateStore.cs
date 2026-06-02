// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// In-memory store for web-flow state. Each <c>/web/start</c> mints a fresh entry; the
/// callback consumes it once and immediately. PKCE verifier and the bound return path
/// live alongside the state so the callback can confirm both without trusting client input.
/// </summary>
internal interface IOAuthStateStore
{
    OAuthState Create(string? returnPath);

    OAuthState? Take(string state);
}

internal sealed record OAuthState(
    string State,
    string CodeVerifier,
    string CodeChallenge,
    string? ReturnPath,
    DateTimeOffset ExpiresAt);

internal sealed class OAuthStateStore(IMemoryCache cache, TimeProvider timeProvider) : IOAuthStateStore
{
    private const string KeyPrefix = "auth:state:";

    /// <summary>Web flow login attempts must complete within this window.</summary>
    private static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(10);

    public OAuthState Create(string? returnPath)
    {
        var state = RandomUrlSafeString(32);
        var verifier = RandomUrlSafeString(64);
        var challenge = CreateChallenge(verifier);
        var expires = timeProvider.GetUtcNow().Add(StateLifetime);

        var entry = new OAuthState(state, verifier, challenge, returnPath, expires);
        cache.Set(KeyPrefix + state, entry, new MemoryCacheEntryOptions { AbsoluteExpiration = expires });
        return entry;
    }

    public OAuthState? Take(string state)
    {
        var key = KeyPrefix + state;
        if (cache.TryGetValue<OAuthState>(key, out var entry) && entry is not null)
        {
            // One-shot: replay attempts must fail, even if the cache TTL hasn't expired.
            cache.Remove(key);
            return entry;
        }
        return null;
    }

    private static string RandomUrlSafeString(int bytes)
    {
        var buffer = RandomNumberGenerator.GetBytes(bytes);
        return Convert.ToBase64String(buffer).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    private static string CreateChallenge(string verifier)
    {
        // PKCE S256: base64url(sha256(ascii(verifier))).
        var hash = SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(verifier));
        return Convert.ToBase64String(hash).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }
}
