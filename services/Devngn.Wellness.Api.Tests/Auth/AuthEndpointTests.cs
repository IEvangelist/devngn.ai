// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Web;
using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class AuthEndpointTests(PostgresContainerFixture fixture)
{
    private static readonly WebApplicationFactoryClientOptions NoRedirect = new() { AllowAutoRedirect = false };

    // ---------------------------------------------------------------------
    // Device Flow

    [Fact]
    public async Task Device_start_returns_session_handle_and_user_code()
    {
        var fakeGh = NewFake();
        fakeGh.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse(
            DeviceCode: "device-code-A",
            UserCode: "AAAA-BBBB",
            VerificationUri: "https://github.com/login/device",
            ExpiresIn: 900,
            Interval: 5));

        using var factory = NewFactory(fakeGh);
        using var client = factory.CreateClient();

        var resp = await client.PostAsync("/v1/auth/github/device", content: null);
        resp.EnsureSuccessStatusCode();

        var body = await resp.Content.ReadFromJsonAsync<AuthEndpoints.DeviceFlowStartResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrEmpty(body!.SessionId));
        Assert.NotEqual("device-code-A", body.SessionId); // session id is server-minted, not the GitHub device code
        Assert.Equal("AAAA-BBBB", body.UserCode);
        Assert.Equal(900, body.ExpiresInSeconds);
        Assert.Equal(5, body.IntervalSeconds);
    }

    [Fact]
    public async Task Device_poll_with_unknown_session_returns_410_expired_token()
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/v1/auth/github/device/poll",
            new AuthEndpoints.DeviceFlowPollRequest("not-a-real-session"));

        Assert.Equal(HttpStatusCode.Gone, resp.StatusCode);
        var err = await resp.Content.ReadFromJsonAsync<AuthEndpoints.AuthErrorResponse>();
        Assert.Equal("expired_token", err!.Error);
    }

    [Fact]
    public async Task Device_poll_pending_returns_202_with_retry_after_header()
    {
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC-1", "https://gh/dev", 900, 5));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Pending(7));

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        var resp = await client.PostAsJsonAsync("/v1/auth/github/device/poll",
            new AuthEndpoints.DeviceFlowPollRequest(sessionId));

        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);
        Assert.Equal("7", resp.Headers.GetValues("Retry-After").Single());
    }

    [Fact]
    public async Task Device_poll_too_fast_returns_429_without_contacting_github_again()
    {
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC-2", "https://gh/dev", 900, 5));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Pending(5));

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        await client.PostAsJsonAsync("/v1/auth/github/device/poll", new AuthEndpoints.DeviceFlowPollRequest(sessionId));
        var second = await client.PostAsJsonAsync("/v1/auth/github/device/poll", new AuthEndpoints.DeviceFlowPollRequest(sessionId));

        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal("5", second.Headers.GetValues("Retry-After").Single());
        // First call hit GitHub once; second was blocked server-side. We never made a second upstream call.
        Assert.Single(fake.PolledDeviceCodes);
    }

    [Theory]
    [InlineData("expired_token", HttpStatusCode.Gone)]
    [InlineData("access_denied", HttpStatusCode.Forbidden)]
    [InlineData("device_flow_disabled", HttpStatusCode.Conflict)]
    [InlineData("incorrect_device_code", HttpStatusCode.BadRequest)]
    public async Task Device_poll_failure_codes_map_to_expected_http_status(string error, HttpStatusCode expected)
    {
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC", "https://gh/dev", 900, 1));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Failed(error, null));

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        var resp = await client.PostAsJsonAsync("/v1/auth/github/device/poll",
            new AuthEndpoints.DeviceFlowPollRequest(sessionId));

        Assert.Equal(expected, resp.StatusCode);
    }

    [Fact]
    public async Task Device_poll_success_issues_jwt_and_persists_user()
    {
        var ghUser = NewGitHubUser();
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC", "https://gh/dev", 900, 1));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Succeeded("gh-access", "read:user"));
        fake.GetUserHandler = (_, _) => Task.FromResult(ghUser);

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        var resp = await client.PostAsJsonAsync("/v1/auth/github/device/poll",
            new AuthEndpoints.DeviceFlowPollRequest(sessionId));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<AuthEndpoints.AccessTokenResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrEmpty(body!.AccessToken));
        Assert.Equal("Bearer", body.TokenType);
        Assert.Equal(ghUser.Login, body.User.Login);

        await using var ctx = fixture.CreateContext();
        Assert.True(await ctx.Users.AnyAsync(u => u.GitHubId == ghUser.Id));
    }

    // ---------------------------------------------------------------------
    // Web Flow

    [Fact]
    public async Task Web_start_with_relative_return_path_redirects_to_github_authorize_with_state_and_pkce()
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient(NoRedirect);

        var resp = await client.GetAsync("/v1/auth/github/web/start?returnPath=%2Fdashboard");

        Assert.Equal(HttpStatusCode.Redirect, resp.StatusCode);
        var location = resp.Headers.Location!.ToString();
        Assert.StartsWith("https://github.example/login/oauth/authorize?", location);

        var query = HttpUtility.ParseQueryString(new Uri(location).Query);
        Assert.False(string.IsNullOrEmpty(query["state"]));
        Assert.False(string.IsNullOrEmpty(query["code_challenge"]));
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.Contains("/v1/auth/github/web/callback", query["redirect_uri"]);
    }

    [Theory]
    [InlineData("https://attacker.example/steal")]
    [InlineData("//attacker.example/steal")]
    [InlineData("/\\attacker.example")]
    [InlineData("dashboard")] // no leading slash
    public async Task Web_start_rejects_unsafe_return_paths(string unsafePath)
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient(NoRedirect);

        var resp = await client.GetAsync($"/v1/auth/github/web/start?returnPath={Uri.EscapeDataString(unsafePath)}");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Web_callback_with_invalid_state_returns_400()
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient(NoRedirect);

        var resp = await client.GetAsync("/v1/auth/github/web/callback?code=abc&state=never-issued");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Web_callback_with_github_error_param_returns_400()
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient(NoRedirect);

        var resp = await client.GetAsync("/v1/auth/github/web/callback?error=access_denied&error_description=nope");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Web_callback_happy_path_with_return_path_redirects_with_jwt_in_fragment()
    {
        var ghUser = NewGitHubUser();
        var fake = NewFake();
        fake.ExchangeWebCodeHandler = (code, _, verifier, _) =>
        {
            Assert.False(string.IsNullOrEmpty(code));
            Assert.False(string.IsNullOrEmpty(verifier));
            return Task.FromResult<WebCallbackOutcome>(new WebCallbackOutcome.Succeeded("gh-web", "read:user"));
        };
        fake.GetUserHandler = (_, _) => Task.FromResult(ghUser);

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient(NoRedirect);

        var start = await client.GetAsync("/v1/auth/github/web/start?returnPath=%2Fdashboard");
        var state = HttpUtility.ParseQueryString(new Uri(start.Headers.Location!.ToString()).Query)["state"]!;

        var resp = await client.GetAsync($"/v1/auth/github/web/callback?code=auth-code&state={state}");

        Assert.Equal(HttpStatusCode.Redirect, resp.StatusCode);
        var location = resp.Headers.Location!.ToString();
        Assert.StartsWith("/dashboard#access_token=", location);
        Assert.Contains("token_type=Bearer", location);
        Assert.Contains("expires_at=", location);
    }

    [Fact]
    public async Task Web_callback_state_cannot_be_replayed()
    {
        var fake = NewFake();
        fake.ExchangeWebCodeHandler = (_, _, _, _) =>
            Task.FromResult<WebCallbackOutcome>(new WebCallbackOutcome.Succeeded("gh-web", "read:user"));
        fake.GetUserHandler = (_, _) => Task.FromResult(NewGitHubUser());

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient(NoRedirect);

        var start = await client.GetAsync("/v1/auth/github/web/start");
        var state = HttpUtility.ParseQueryString(new Uri(start.Headers.Location!.ToString()).Query)["state"]!;

        var first = await client.GetAsync($"/v1/auth/github/web/callback?code=c1&state={state}");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.GetAsync($"/v1/auth/github/web/callback?code=c2&state={state}");
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    // ---------------------------------------------------------------------
    // /me

    [Fact]
    public async Task Me_without_bearer_returns_401()
    {
        using var factory = NewFactory(NewFake());
        using var client = factory.CreateClient();

        var resp = await client.GetAsync("/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Me_with_valid_bearer_returns_user_profile()
    {
        var ghUser = NewGitHubUser();
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC", "https://gh/dev", 900, 1));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Succeeded("gh-tok", "read:user"));
        fake.GetUserHandler = (_, _) => Task.FromResult(ghUser);

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        var pollResp = await client.PostAsJsonAsync("/v1/auth/github/device/poll", new AuthEndpoints.DeviceFlowPollRequest(sessionId));
        var token = (await pollResp.Content.ReadFromJsonAsync<AuthEndpoints.AccessTokenResponse>())!.AccessToken;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var meResp = await client.GetAsync("/v1/auth/me");

        Assert.Equal(HttpStatusCode.OK, meResp.StatusCode);
        var me = await meResp.Content.ReadFromJsonAsync<AuthEndpoints.AuthenticatedUserResponse>();
        Assert.Equal(ghUser.Id, me!.GitHubId);
        Assert.Equal(ghUser.Login, me.Login);
    }

    [Fact]
    public async Task Me_returns_404_when_authenticated_user_was_deleted()
    {
        var ghUser = NewGitHubUser();
        var fake = NewFake();
        fake.RequestDeviceCodeHandler = _ => Task.FromResult(new GitHubDeviceCodeResponse("dc", "UC", "https://gh/dev", 900, 1));
        fake.PollDeviceTokenHandler = (_, _) => Task.FromResult<DevicePollOutcome>(new DevicePollOutcome.Succeeded("gh-tok", "read:user"));
        fake.GetUserHandler = (_, _) => Task.FromResult(ghUser);

        using var factory = NewFactory(fake);
        using var client = factory.CreateClient();

        var sessionId = await StartAsync(client);
        var pollResp = await client.PostAsJsonAsync("/v1/auth/github/device/poll", new AuthEndpoints.DeviceFlowPollRequest(sessionId));
        var token = (await pollResp.Content.ReadFromJsonAsync<AuthEndpoints.AccessTokenResponse>())!.AccessToken;

        await using (var ctx = fixture.CreateContext())
        {
            var user = await ctx.Users.SingleAsync(u => u.GitHubId == ghUser.Id);
            ctx.Users.Remove(user);
            await ctx.SaveChangesAsync();
        }

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var meResp = await client.GetAsync("/v1/auth/me");
        Assert.Equal(HttpStatusCode.NotFound, meResp.StatusCode);
    }

    // ---------------------------------------------------------------------
    // Helpers

    private AuthWebAppFactory NewFactory(FakeGitHubOAuthService fake)
        => new(
            fixture.ConnectionString,
            configureConfig: cfg =>
            {
                // Point GitHub endpoints at a fake hostname so any accidental real HTTP
                // would fail loudly instead of leaking out.
                cfg["Auth:GitHub:DeviceCodeEndpoint"] = "https://github.example/login/device/code";
                cfg["Auth:GitHub:AccessTokenEndpoint"] = "https://github.example/login/oauth/access_token";
                cfg["Auth:GitHub:AuthorizeEndpoint"] = "https://github.example/login/oauth/authorize";
                cfg["Auth:GitHub:UserEndpoint"] = "https://api.github.example/user";
            },
            configureServices: services =>
            {
                services.RemoveAll<IGitHubOAuthService>();
                services.AddSingleton<IGitHubOAuthService>(fake);
            });

    private static async Task<string> StartAsync(HttpClient client)
    {
        var resp = await client.PostAsync("/v1/auth/github/device", content: null);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<AuthEndpoints.DeviceFlowStartResponse>();
        return body!.SessionId;
    }

    private static FakeGitHubOAuthService NewFake() => new();

    private static GitHubUser NewGitHubUser() => new(
        Id: Random.Shared.NextInt64(1, long.MaxValue),
        Login: $"login-{Guid.NewGuid():N}",
        Name: "Octo Dev",
        AvatarUrl: "https://avatars.example/u");
}
