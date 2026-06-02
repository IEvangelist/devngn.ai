// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Issues signed JWT access tokens for an authenticated <see cref="User"/>.
/// Validation is performed by ASP.NET Core's JwtBearer middleware using the same
/// <see cref="JwtOptions"/>, so this interface deliberately does not expose a
/// validation method - keep the asymmetry intentional.
/// </summary>
public interface IJwtTokenService
{
    IssuedToken Issue(User user);
}

/// <summary>Result of <see cref="IJwtTokenService.Issue"/>: the encoded token and its absolute expiry.</summary>
public sealed record IssuedToken(string AccessToken, DateTimeOffset ExpiresAt, string TokenType = "Bearer");
