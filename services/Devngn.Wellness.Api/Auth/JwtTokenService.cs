// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Claims;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// HS256 JWT issuer. The signing key (<see cref="JwtOptions.SigningKey"/>) is loaded
/// once at construction; the API process restarts on rotation. The token header
/// always embeds <see cref="JwtOptions.KeyId"/> so validators can pick the right key
/// when rotation lands.
/// </summary>
internal sealed class JwtTokenService(
    IOptions<JwtOptions> options,
    TimeProvider timeProvider) : IJwtTokenService
{
    public const string GitHubIdClaimType = "gh:id";

    public const string GitHubLoginClaimType = "gh:login";

    private readonly JwtOptions _opts = options.Value;

    private readonly SigningCredentials _credentials = new(
        new SymmetricSecurityKey(Convert.FromBase64String(options.Value.SigningKey))
        {
            KeyId = options.Value.KeyId,
        },
        SecurityAlgorithms.HmacSha256);

    public IssuedToken Issue(User user)
    {
        ArgumentNullException.ThrowIfNull(user);

        var now = timeProvider.GetUtcNow();
        var expires = now.AddMinutes(_opts.AccessTokenLifetimeMinutes);

        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
            [JwtRegisteredClaimNames.Jti] = Guid.CreateVersion7().ToString(),
            [GitHubIdClaimType] = user.GitHubId,
            [GitHubLoginClaimType] = user.Login,
        };
        if (!string.IsNullOrWhiteSpace(user.DisplayName))
        {
            claims[JwtRegisteredClaimNames.Name] = user.DisplayName!;
        }

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _opts.Issuer,
            Audience = _opts.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = _credentials,
            Claims = claims,
        };

        var handler = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false };
        var token = handler.CreateToken(descriptor);
        return new IssuedToken(token, expires);
    }

    /// <summary>
    /// Builds the validation parameters JwtBearer middleware should use. Centralized here
    /// so tests can construct identical parameters when validating issued tokens directly.
    /// </summary>
    internal static TokenValidationParameters CreateValidationParameters(JwtOptions opts) => new()
    {
        ValidateIssuer = true,
        ValidIssuer = opts.Issuer,
        ValidateAudience = true,
        ValidAudience = opts.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(opts.SigningKey)) { KeyId = opts.KeyId },
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
        NameClaimType = JwtRegisteredClaimNames.Name,
        RoleClaimType = ClaimTypes.Role,
    };
}
