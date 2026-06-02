// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Auth;

namespace Devngn.Wellness.Api.Tests.Auth;

/// <summary>
/// Hand-rolled fake for <see cref="IGitHubOAuthService"/> so endpoint tests can drive
/// the auth flows without hitting GitHub. Each property is a function the test sets;
/// calls without a configured function throw to surface unintended invocations.
/// </summary>
internal sealed class FakeGitHubOAuthService : IGitHubOAuthService
{
    public Func<CancellationToken, Task<GitHubDeviceCodeResponse>>? RequestDeviceCodeHandler { get; set; }

    public Func<string, CancellationToken, Task<DevicePollOutcome>>? PollDeviceTokenHandler { get; set; }

    public Func<string, string, string, CancellationToken, Task<WebCallbackOutcome>>? ExchangeWebCodeHandler { get; set; }

    public Func<string, CancellationToken, Task<GitHubUser>>? GetUserHandler { get; set; }

    public List<string> PolledDeviceCodes { get; } = [];

    public List<(string Code, string RedirectUri, string CodeVerifier)> WebExchanges { get; } = [];

    public Task<GitHubDeviceCodeResponse> RequestDeviceCodeAsync(CancellationToken ct)
        => (RequestDeviceCodeHandler
            ?? throw new InvalidOperationException("RequestDeviceCodeHandler not configured"))(ct);

    public Task<DevicePollOutcome> PollDeviceTokenAsync(string deviceCode, CancellationToken ct)
    {
        PolledDeviceCodes.Add(deviceCode);
        return (PollDeviceTokenHandler
            ?? throw new InvalidOperationException("PollDeviceTokenHandler not configured"))(deviceCode, ct);
    }

    public Task<WebCallbackOutcome> ExchangeWebCodeAsync(string code, string redirectUri, string codeVerifier, CancellationToken ct)
    {
        WebExchanges.Add((code, redirectUri, codeVerifier));
        return (ExchangeWebCodeHandler
            ?? throw new InvalidOperationException("ExchangeWebCodeHandler not configured"))(code, redirectUri, codeVerifier, ct);
    }

    public Task<GitHubUser> GetUserAsync(string accessToken, CancellationToken ct)
        => (GetUserHandler
            ?? throw new InvalidOperationException("GetUserHandler not configured"))(accessToken, ct);
}
