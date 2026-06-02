// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Headers;
using System.Web;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Schedule.Google;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GoogleConnectEndpointTests(PostgresContainerFixture postgres)
{
    private static readonly WebApplicationFactoryClientOptions NoRedirect = new() { AllowAutoRedirect = false };

    private AuthWebAppFactory Factory(FakeGoogleCalendarClient? fake = null) =>
        new(postgres.ConnectionString, configureServices: services =>
        {
            if (fake is not null)
            {
                services.RemoveAll<IGoogleCalendarClient>();
                services.AddScoped<IGoogleCalendarClient>(_ => fake);
            }
        });

    [Fact]
    public async Task Connect_redirects_to_google_with_state_and_pkce()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClient(NoRedirect);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", seeded.Token);

        var response = await client.GetAsync("/v1/schedule/connect/google?returnPath=/dashboard");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/o/oauth2/v2/auth", location, StringComparison.Ordinal);
        Assert.Contains("response_type=code", location, StringComparison.Ordinal);
        Assert.Contains("code_challenge_method=S256", location, StringComparison.Ordinal);
        Assert.Contains("access_type=offline", location, StringComparison.Ordinal);
        Assert.Contains("prompt=consent", location, StringComparison.Ordinal);
        Assert.Contains("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.freebusy", location, StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var states = await db.ScheduleOAuthStates
            .Where(s => s.UserId == seeded.Id && s.Provider == ScheduleOAuthProvider.Google)
            .ToListAsync();
        Assert.Single(states);
        Assert.Null(states[0].ConsumedAt);
        Assert.Equal("/dashboard", states[0].ReturnPath);
    }

    [Fact]
    public async Task Connect_rejects_unsafe_returnPath()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClient(NoRedirect);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", seeded.Token);

        var response = await client.GetAsync($"/v1/schedule/connect/google?returnPath={Uri.EscapeDataString("https://evil.example/")}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Callback_happy_path_creates_source_and_consumes_state()
    {
        var fake = new FakeGoogleCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new GoogleTokenResult(
                "access-xyz",
                "refresh-xyz",
                "https://www.googleapis.com/auth/calendar.freebusy",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/google?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("connected=google", response.Headers.Location!.ToString(), StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = await db.ScheduleSources
            .SingleAsync(s => s.UserId == seeded.Id && s.Type == ScheduleSourceType.Google);
        Assert.Equal(ScheduleSourceConnectionStatus.Connected, source.ConnectionStatus);
        Assert.NotNull(source.ProtectedRefreshToken);
        Assert.Equal("refresh-xyz", protector.Unprotect(source.ProtectedRefreshToken!));

        var consumed = await db.ScheduleOAuthStates.SingleAsync(s => s.State == state);
        Assert.NotNull(consumed.ConsumedAt);
    }

    [Fact]
    public async Task Callback_with_invalid_state_returns_400()
    {
        using var factory = Factory();
        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync("/v1/schedule/callback/google?code=x&state=does-not-exist");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Callback_with_error_param_redirects_with_error()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token, returnPath: "/oops");

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/google?error=access_denied&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("/oops", location, StringComparison.Ordinal);
        Assert.Contains("error=access_denied", location, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_with_missing_refresh_token_redirects_with_error()
    {
        var fake = new FakeGoogleCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new GoogleTokenResult(
                "access-xyz",
                null,
                "https://www.googleapis.com/auth/calendar.freebusy",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/google?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("error=missing_refresh_token", response.Headers.Location!.ToString(), StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        Assert.False(await db.ScheduleSources.AnyAsync(s => s.UserId == seeded.Id));
    }

    [Fact]
    public async Task Callback_with_insufficient_scope_redirects_with_error()
    {
        var fake = new FakeGoogleCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new GoogleTokenResult(
                "access-xyz",
                "refresh-xyz",
                "https://www.googleapis.com/auth/userinfo.email",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/google?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("error=insufficient_scope", response.Headers.Location!.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_replays_state_with_second_request_returns_400()
    {
        var fake = new FakeGoogleCalendarClient();
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var first = await client.GetAsync($"/v1/schedule/callback/google?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, first.StatusCode);

        var second = await client.GetAsync($"/v1/schedule/callback/google?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Callback_upserts_existing_google_source()
    {
        var fake = new FakeGoogleCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new GoogleTokenResult(
                "access-second",
                "refresh-second",
                "https://www.googleapis.com/auth/calendar.freebusy",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();

        var state1 = await BeginAndCaptureStateAsync(factory, seeded.Token);
        using var client = factory.CreateClient(NoRedirect);
        await client.GetAsync($"/v1/schedule/callback/google?code=code1&state={Uri.EscapeDataString(state1)}");

        var state2 = await BeginAndCaptureStateAsync(factory, seeded.Token);
        await client.GetAsync($"/v1/schedule/callback/google?code=code2&state={Uri.EscapeDataString(state2)}");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var sources = await db.ScheduleSources
            .Where(s => s.UserId == seeded.Id && s.Type == ScheduleSourceType.Google)
            .ToListAsync();
        Assert.Single(sources);
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        Assert.Equal("refresh-second", protector.Unprotect(sources[0].ProtectedRefreshToken!));
    }

    private static async Task<string> BeginAndCaptureStateAsync(
        AuthWebAppFactory factory, string token, string returnPath = "/")
    {
        using var client = factory.CreateClient(NoRedirect);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await client.GetAsync($"/v1/schedule/connect/google?returnPath={Uri.EscapeDataString(returnPath)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);

        // The redirect Location is absolute (https://accounts.google.com/...) so wrap
        // a Uri around it to access .Query reliably.
        var state = HttpUtility.ParseQueryString(new Uri(response.Headers.Location!.ToString()).Query)["state"];
        Assert.False(string.IsNullOrEmpty(state));
        return state!;
    }
}
