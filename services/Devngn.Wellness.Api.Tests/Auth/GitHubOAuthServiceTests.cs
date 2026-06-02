// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devngn.Wellness.Api.Auth;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

public sealed class GitHubOAuthServiceTests
{
    private static readonly GitHubOAuthOptions Opts = new()
    {
        ClientId = "test-client",
        ClientSecret = "test-secret",
        Scopes = "read:user",
        DeviceCodeEndpoint = "https://github.example/login/device/code",
        AccessTokenEndpoint = "https://github.example/login/oauth/access_token",
        AuthorizeEndpoint = "https://github.example/login/oauth/authorize",
        UserEndpoint = "https://api.github.example/user",
    };

    [Fact]
    public async Task RequestDeviceCodeAsync_posts_client_id_and_scope_and_returns_payload()
    {
        HttpRequestMessage? captured = null;
        var handler = new StubHttpMessageHandler(async (req, _) =>
        {
            captured = req;
            var content = await req.Content!.ReadAsStringAsync();
            Assert.Contains("client_id=test-client", content);
            Assert.Contains("scope=read%3Auser", content);
            return JsonResponse(new
            {
                device_code = "device-xyz",
                user_code = "WDJB-MJHT",
                verification_uri = "https://github.com/login/device",
                expires_in = 900,
                interval = 5,
            });
        });
        var sut = NewService(handler);

        var result = await sut.RequestDeviceCodeAsync(CancellationToken.None);

        Assert.Equal("device-xyz", result.DeviceCode);
        Assert.Equal("WDJB-MJHT", result.UserCode);
        Assert.Equal(900, result.ExpiresIn);
        Assert.Equal(5, result.Interval);
        Assert.Equal(Opts.DeviceCodeEndpoint, captured!.RequestUri!.ToString());
    }

    [Theory]
    [InlineData("authorization_pending", typeof(DevicePollOutcome.Pending))]
    [InlineData("slow_down", typeof(DevicePollOutcome.SlowDown))]
    [InlineData("expired_token", typeof(DevicePollOutcome.Failed))]
    [InlineData("access_denied", typeof(DevicePollOutcome.Failed))]
    [InlineData("incorrect_device_code", typeof(DevicePollOutcome.Failed))]
    [InlineData("device_flow_disabled", typeof(DevicePollOutcome.Failed))]
    public async Task PollDeviceTokenAsync_maps_each_github_error_code(string error, Type expected)
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(JsonResponse(new { error, interval = 10 })));
        var sut = NewService(handler);

        var outcome = await sut.PollDeviceTokenAsync("dc", CancellationToken.None);

        Assert.IsType(expected, outcome);
        if (outcome is DevicePollOutcome.Failed f)
        {
            Assert.Equal(error, f.Error);
        }
    }

    [Fact]
    public async Task PollDeviceTokenAsync_returns_succeeded_when_access_token_present()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(JsonResponse(new { access_token = "gh-token-abc", token_type = "bearer", scope = "read:user" })));
        var sut = NewService(handler);

        var outcome = await sut.PollDeviceTokenAsync("dc", CancellationToken.None);

        var ok = Assert.IsType<DevicePollOutcome.Succeeded>(outcome);
        Assert.Equal("gh-token-abc", ok.AccessToken);
        Assert.Equal("read:user", ok.Scope);
    }

    [Fact]
    public async Task ExchangeWebCodeAsync_sends_pkce_verifier_and_returns_success()
    {
        var handler = new StubHttpMessageHandler(async (req, _) =>
        {
            var body = await req.Content!.ReadAsStringAsync();
            Assert.Contains("code=auth-code", body);
            Assert.Contains("code_verifier=verifier-xyz", body);
            Assert.Contains("redirect_uri=https%3A%2F%2Fhost.example%2Fcb", body);
            Assert.Contains("client_secret=test-secret", body);
            return JsonResponse(new { access_token = "gh-web-token" });
        });
        var sut = NewService(handler);

        var outcome = await sut.ExchangeWebCodeAsync(
            "auth-code",
            "https://host.example/cb",
            "verifier-xyz",
            CancellationToken.None);

        var ok = Assert.IsType<WebCallbackOutcome.Succeeded>(outcome);
        Assert.Equal("gh-web-token", ok.AccessToken);
    }

    [Fact]
    public async Task ExchangeWebCodeAsync_maps_github_error_to_failed_outcome()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(JsonResponse(new { error = "bad_verification_code", error_description = "Code expired" })));
        var sut = NewService(handler);

        var outcome = await sut.ExchangeWebCodeAsync("c", "https://h/cb", "v", CancellationToken.None);

        var failed = Assert.IsType<WebCallbackOutcome.Failed>(outcome);
        Assert.Equal("bad_verification_code", failed.Error);
        Assert.Equal("Code expired", failed.Description);
    }

    [Fact]
    public async Task GetUserAsync_sends_bearer_token_and_deserializes_user()
    {
        HttpRequestMessage? captured = null;
        var handler = new StubHttpMessageHandler((req, _) =>
        {
            captured = req;
            return Task.FromResult(JsonResponse(new
            {
                id = 12345L,
                login = "octodev",
                name = "Octo Dev",
                avatar_url = "https://avatars.example/u/12345",
            }));
        });
        var sut = NewService(handler);

        var user = await sut.GetUserAsync("gh-access-token", CancellationToken.None);

        Assert.Equal(12345L, user.Id);
        Assert.Equal("octodev", user.Login);
        Assert.Equal("Octo Dev", user.Name);
        Assert.Equal("Bearer", captured!.Headers.Authorization!.Scheme);
        Assert.Equal("gh-access-token", captured.Headers.Authorization.Parameter);
    }

    private static GitHubOAuthService NewService(StubHttpMessageHandler handler)
    {
        var factory = new SingleHandlerHttpClientFactory(handler);
        return new GitHubOAuthService(factory, Options.Create(Opts), NullLogger<GitHubOAuthService>.Instance);
    }

    private static HttpResponseMessage JsonResponse(object payload)
        => new(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(payload, options: new JsonSerializerOptions
            {
                PropertyNamingPolicy = null, // GitHub uses snake_case literally and the handler stubs already use that.
            }),
        };

    private sealed class SingleHandlerHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }
}
