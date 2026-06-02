// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography;
using System.Text;
using Devngn.Wellness.Api.Auth;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

public sealed class OAuthStateStoreTests
{
    [Fact]
    public void Create_emits_url_safe_state_and_verifier_with_matching_S256_challenge()
    {
        var store = new OAuthStateStore(new MemoryCache(new MemoryCacheOptions()), TimeProvider.System);

        var state = store.Create(returnPath: "/dashboard");

        Assert.False(string.IsNullOrEmpty(state.State));
        Assert.False(string.IsNullOrEmpty(state.CodeVerifier));
        Assert.DoesNotContain('+', state.State);
        Assert.DoesNotContain('/', state.State);
        Assert.DoesNotContain('=', state.State);

        var expectedChallenge = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(state.CodeVerifier)))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        Assert.Equal(expectedChallenge, state.CodeChallenge);
        Assert.Equal("/dashboard", state.ReturnPath);
    }

    [Fact]
    public void Take_is_one_shot()
    {
        var store = new OAuthStateStore(new MemoryCache(new MemoryCacheOptions()), TimeProvider.System);
        var s = store.Create(null);

        Assert.NotNull(store.Take(s.State));
        Assert.Null(store.Take(s.State));
    }

    [Fact]
    public void Take_returns_null_for_unknown_state()
    {
        var store = new OAuthStateStore(new MemoryCache(new MemoryCacheOptions()), TimeProvider.System);
        Assert.Null(store.Take("never-issued"));
    }
}
