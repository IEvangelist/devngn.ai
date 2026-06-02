// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography;
using System.Text;

namespace Devngn.Wellness.Api.Schedule.OAuth;

/// <summary>
/// PKCE (RFC 7636) helper. PKCE binds the authorization-code exchange to the same
/// client that started the flow: the user-agent redirects with a hashed challenge,
/// then the token-exchange step must present the original verifier. Without it, a
/// stolen authorization code (e.g., via referer leakage in browser history) could be
/// redeemed by an attacker.
/// </summary>
internal static class PkcePair
{
    /// <summary>Generates a 64-character URL-safe verifier and its S256 challenge.</summary>
    public static (string Verifier, string Challenge) Generate()
    {
        // Per RFC 7636: 43-128 chars from [A-Z][a-z][0-9]-._~. We use 64 random bytes
        // base64url-encoded, which yields ~86 chars — well within the spec.
        var bytes = RandomNumberGenerator.GetBytes(64);
        var verifier = Base64Url(bytes);
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(verifier));
        var challenge = Base64Url(hash);
        return (verifier, challenge);
    }

    /// <summary>Generates an opaque CSRF state token; 32 random bytes base64url-encoded.</summary>
    public static string NewState() => Base64Url(RandomNumberGenerator.GetBytes(32));

    private static string Base64Url(ReadOnlySpan<byte> bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
