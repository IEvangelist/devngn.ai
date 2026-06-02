// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Text.Json.Serialization;

namespace Devngn.Wellness.Api.Auth;

/// <summary>GitHub <c>POST /login/device/code</c> success payload.</summary>
internal sealed record GitHubDeviceCodeResponse(
    [property: JsonPropertyName("device_code")] string DeviceCode,
    [property: JsonPropertyName("user_code")] string UserCode,
    [property: JsonPropertyName("verification_uri")] string VerificationUri,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("interval")] int Interval);

/// <summary>
/// GitHub <c>POST /login/oauth/access_token</c> response. GitHub returns either a success
/// shape with <see cref="AccessToken"/> populated or an error shape with <see cref="Error"/>.
/// All fields are nullable because the same response object accommodates both.
/// </summary>
internal sealed record GitHubAccessTokenResponse(
    [property: JsonPropertyName("access_token")] string? AccessToken,
    [property: JsonPropertyName("token_type")] string? TokenType,
    [property: JsonPropertyName("scope")] string? Scope,
    [property: JsonPropertyName("error")] string? Error,
    [property: JsonPropertyName("error_description")] string? ErrorDescription,
    [property: JsonPropertyName("interval")] int? Interval);

/// <summary>
/// Subset of GitHub's user payload that the wellness service consumes. We only read
/// fields that map to <see cref="Devngn.Wellness.Api.Data.Entities.User"/>; everything
/// else is ignored to keep the contract tight and the PII surface minimal.
/// </summary>
internal sealed record GitHubUser(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("login")] string Login,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("avatar_url")] string? AvatarUrl);
