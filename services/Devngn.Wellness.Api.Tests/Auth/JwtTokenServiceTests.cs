// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography;
using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

public sealed class JwtTokenServiceTests
{
    private static readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private static readonly JwtOptions DefaultOptions = new()
    {
        Issuer = "iss-test",
        Audience = "aud-test",
        SigningKey = Key,
        KeyId = "kid-1",
        AccessTokenLifetimeMinutes = 60,
    };

    [Fact]
    public async Task Issue_round_trips_through_handler_validation_with_expected_claims()
    {
        // Anchor on wall-clock so the validator's wall-clock-based lifetime check accepts
        // the freshly issued token. We don't need an arbitrary fixed timestamp here.
        var fixedNow = DateTimeOffset.UtcNow;
        var time = new FakeTimeProvider(fixedNow);
        var user = new User
        {
            Id = Guid.CreateVersion7(),
            GitHubId = 4242,
            Login = "octodev",
            DisplayName = "Octo Dev",
        };

        var sut = new JwtTokenService(Options.Create(DefaultOptions), time);
        var issued = sut.Issue(user);

        Assert.Equal("Bearer", issued.TokenType);
        Assert.Equal(fixedNow.AddMinutes(60), issued.ExpiresAt);

        var handler = new JsonWebTokenHandler();
        var result = await handler.ValidateTokenAsync(issued.AccessToken, JwtTokenService.CreateValidationParameters(DefaultOptions));

        Assert.True(result.IsValid, result.Exception?.ToString());
        Assert.Equal(user.Id.ToString(), result.Claims[JwtRegisteredClaimNames.Sub]);
        Assert.Equal(user.Login, result.Claims[JwtTokenService.GitHubLoginClaimType]);
        // gh:id flows as long; some serializers return it as long, others as int — accept either.
        Assert.Equal(user.GitHubId, Convert.ToInt64(result.Claims[JwtTokenService.GitHubIdClaimType]));
        Assert.Equal(user.DisplayName, result.Claims[JwtRegisteredClaimNames.Name]);
        Assert.False(string.IsNullOrEmpty(result.Claims[JwtRegisteredClaimNames.Jti]?.ToString()));

        var parsed = handler.ReadJsonWebToken(issued.AccessToken);
        Assert.Equal("kid-1", parsed.Kid);
        Assert.Equal("HS256", parsed.Alg);
    }

    [Fact]
    public async Task Token_signed_with_a_different_key_is_rejected()
    {
        var sut = new JwtTokenService(Options.Create(DefaultOptions), new FakeTimeProvider(DateTimeOffset.UtcNow));
        var issued = sut.Issue(NewUser());

        var wrongOpts = new JwtOptions
        {
            Issuer = DefaultOptions.Issuer,
            Audience = DefaultOptions.Audience,
            SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            KeyId = DefaultOptions.KeyId,
            AccessTokenLifetimeMinutes = DefaultOptions.AccessTokenLifetimeMinutes,
        };

        var result = await new JsonWebTokenHandler()
            .ValidateTokenAsync(issued.AccessToken, JwtTokenService.CreateValidationParameters(wrongOpts));

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Token_with_wrong_audience_is_rejected()
    {
        var sut = new JwtTokenService(Options.Create(DefaultOptions), new FakeTimeProvider(DateTimeOffset.UtcNow));
        var issued = sut.Issue(NewUser());

        var wrongOpts = new JwtOptions
        {
            Issuer = DefaultOptions.Issuer,
            Audience = "wrong-audience",
            SigningKey = DefaultOptions.SigningKey,
            KeyId = DefaultOptions.KeyId,
        };
        var result = await new JsonWebTokenHandler()
            .ValidateTokenAsync(issued.AccessToken, JwtTokenService.CreateValidationParameters(wrongOpts));

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Expired_token_is_rejected()
    {
        // Mint a token whose lifetime ended 60+ minutes ago in wall-clock time, so the
        // validator's wall-clock lifetime check rejects it without us having to advance
        // a fake clock that the validator can't see.
        var past = DateTimeOffset.UtcNow.AddMinutes(-(DefaultOptions.AccessTokenLifetimeMinutes + 10));
        var time = new FakeTimeProvider(past);
        var sut = new JwtTokenService(Options.Create(DefaultOptions), time);
        var issued = sut.Issue(NewUser());

        var validationParams = JwtTokenService.CreateValidationParameters(DefaultOptions);
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(issued.AccessToken, validationParams);

        Assert.False(result.IsValid);
        Assert.IsType<SecurityTokenExpiredException>(result.Exception);
        await Task.CompletedTask;
    }

    private static User NewUser() => new()
    {
        Id = Guid.CreateVersion7(),
        GitHubId = Random.Shared.NextInt64(1, long.MaxValue),
        Login = "octodev",
        DisplayName = "Octo Dev",
    };
}

internal sealed class FakeTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public void Advance(TimeSpan by) => _now = _now.Add(by);

    public override DateTimeOffset GetUtcNow() => _now;
}
