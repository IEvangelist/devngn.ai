// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Talks to GitHub's OAuth surface. Kept narrow so tests can substitute a fake without
/// running real HTTP traffic. Implementations must:
/// <list type="bullet">
///   <item>Always send <c>Accept: application/json</c> so GitHub returns JSON, not querystrings.</item>
///   <item>Always send a stable <c>User-Agent</c> (GitHub returns 403 without one).</item>
///   <item>Never log access tokens, client secrets, or device codes.</item>
/// </list>
/// </summary>
internal interface IGitHubOAuthService
{
    Task<GitHubDeviceCodeResponse> RequestDeviceCodeAsync(CancellationToken ct);

    Task<DevicePollOutcome> PollDeviceTokenAsync(string deviceCode, CancellationToken ct);

    Task<WebCallbackOutcome> ExchangeWebCodeAsync(
        string code,
        string redirectUri,
        string codeVerifier,
        CancellationToken ct);

    Task<GitHubUser> GetUserAsync(string accessToken, CancellationToken ct);
}
