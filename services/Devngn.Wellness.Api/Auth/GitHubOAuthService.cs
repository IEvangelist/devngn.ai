// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Auth;

internal sealed class GitHubOAuthService(
    IHttpClientFactory httpClientFactory,
    IOptions<GitHubOAuthOptions> options,
    ILogger<GitHubOAuthService> logger) : IGitHubOAuthService
{
    public const string OAuthClientName = "github-oauth";
    public const string ApiClientName = "github-api";

    private readonly GitHubOAuthOptions _opts = options.Value;

    public async Task<GitHubDeviceCodeResponse> RequestDeviceCodeAsync(CancellationToken ct)
    {
        using var client = httpClientFactory.CreateClient(OAuthClientName);

        using var request = new HttpRequestMessage(HttpMethod.Post, _opts.DeviceCodeEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _opts.ClientId,
                ["scope"] = _opts.Scopes,
            }),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<GitHubDeviceCodeResponse>(ct)
            ?? throw new InvalidOperationException("GitHub returned an empty device-code response.");

        // device_code is sensitive (it grants the bearer the ability to complete an auth);
        // user_code is what the human types in the browser and is meant to be displayed.
        logger.LogInformation(
            "Device code issued: user_code={UserCode} expires_in={ExpiresIn}s interval={Interval}s",
            payload.UserCode, payload.ExpiresIn, payload.Interval);

        return payload;
    }

    public async Task<DevicePollOutcome> PollDeviceTokenAsync(string deviceCode, CancellationToken ct)
    {
        using var client = httpClientFactory.CreateClient(OAuthClientName);

        using var request = new HttpRequestMessage(HttpMethod.Post, _opts.AccessTokenEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _opts.ClientId,
                ["device_code"] = deviceCode,
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
            }),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadFromJsonAsync<GitHubAccessTokenResponse>(ct)
            ?? throw new InvalidOperationException("GitHub returned an empty access-token response.");

        return MapPollOutcome(body);
    }

    public async Task<WebCallbackOutcome> ExchangeWebCodeAsync(
        string code,
        string redirectUri,
        string codeVerifier,
        CancellationToken ct)
    {
        using var client = httpClientFactory.CreateClient(OAuthClientName);

        using var request = new HttpRequestMessage(HttpMethod.Post, _opts.AccessTokenEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _opts.ClientId,
                ["client_secret"] = _opts.ClientSecret,
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
                ["code_verifier"] = codeVerifier,
            }),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadFromJsonAsync<GitHubAccessTokenResponse>(ct)
            ?? throw new InvalidOperationException("GitHub returned an empty access-token response.");

        if (!string.IsNullOrEmpty(body.Error))
        {
            return new WebCallbackOutcome.Failed(body.Error, body.ErrorDescription);
        }
        if (!string.IsNullOrEmpty(body.AccessToken))
        {
            return new WebCallbackOutcome.Succeeded(body.AccessToken, body.Scope);
        }

        return new WebCallbackOutcome.Failed(
            "invalid_response",
            "GitHub returned neither an access_token nor an error field.");
    }

    public async Task<GitHubUser> GetUserAsync(string accessToken, CancellationToken ct)
    {
        using var client = httpClientFactory.CreateClient(ApiClientName);

        using var request = new HttpRequestMessage(HttpMethod.Get, _opts.UserEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<GitHubUser>(ct)
            ?? throw new InvalidOperationException("GitHub returned an empty user response.");
    }

    /// <summary>
    /// Maps GitHub's access-token response to a strongly-typed outcome. The error vocabulary
    /// here mirrors the GitHub Device Flow spec: <c>authorization_pending</c>, <c>slow_down</c>,
    /// <c>expired_token</c>, <c>access_denied</c>, <c>incorrect_device_code</c>,
    /// <c>device_flow_disabled</c>, plus anything else GitHub may emit.
    /// </summary>
    private static DevicePollOutcome MapPollOutcome(GitHubAccessTokenResponse body) => body.Error switch
    {
        null or "" when !string.IsNullOrEmpty(body.AccessToken)
            => new DevicePollOutcome.Succeeded(body.AccessToken, body.Scope),
        "authorization_pending"
            => new DevicePollOutcome.Pending(Math.Max(1, body.Interval ?? 5)),
        "slow_down"
            => new DevicePollOutcome.SlowDown(Math.Max(1, body.Interval ?? 10)),
        var err
            => new DevicePollOutcome.Failed(err ?? "invalid_response", body.ErrorDescription),
    };
}
