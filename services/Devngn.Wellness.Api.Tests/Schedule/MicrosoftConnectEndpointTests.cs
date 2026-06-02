// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Headers;
using System.Web;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Schedule.Microsoft;
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
public sealed class MicrosoftConnectEndpointTests(PostgresContainerFixture postgres)
{
    private static readonly WebApplicationFactoryClientOptions NoRedirect = new() { AllowAutoRedirect = false };

    private AuthWebAppFactory Factory(FakeMicrosoftCalendarClient? fake = null) =>
        new(postgres.ConnectionString, configureServices: services =>
        {
            if (fake is not null)
            {
                services.RemoveAll<IMicrosoftCalendarClient>();
                services.AddScoped<IMicrosoftCalendarClient>(_ => fake);
            }
        });

    [Fact]
    public async Task Connect_redirects_to_microsoft_with_state_and_pkce()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClient(NoRedirect);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", seeded.Token);

        var response = await client.GetAsync("/v1/schedule/connect/microsoft?returnPath=/dashboard");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize", location, StringComparison.Ordinal);
        Assert.Contains("response_type=code", location, StringComparison.Ordinal);
        Assert.Contains("code_challenge_method=S256", location, StringComparison.Ordinal);
        // Decoded-scope check is robust against either %20 or + encoding for the space.
        var qs = HttpUtility.ParseQueryString(new Uri(location).Query);
        Assert.Equal("Calendars.Read offline_access", qs["scope"]);
        // Deliberately NO prompt=consent (per rubber-duck #8 — too aggressive as default).
        Assert.DoesNotContain("prompt=consent", location, StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var states = await db.ScheduleOAuthStates
            .Where(s => s.UserId == seeded.Id && s.Provider == ScheduleOAuthProvider.Microsoft)
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

        var response = await client.GetAsync($"/v1/schedule/connect/microsoft?returnPath={Uri.EscapeDataString("//evil.example/")}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Callback_happy_path_creates_source_and_consumes_state()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-xyz", "refresh-xyz", "Calendars.Read", DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?code=auth-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("connected=microsoft", response.Headers.Location!.ToString(), StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = await db.ScheduleSources
            .SingleAsync(s => s.UserId == seeded.Id && s.Type == ScheduleSourceType.Microsoft);
        Assert.Equal(ScheduleSourceConnectionStatus.Connected, source.ConnectionStatus);
        Assert.Equal("refresh-xyz", protector.Unprotect(source.ProtectedRefreshToken!));

        var consumed = await db.ScheduleOAuthStates.SingleAsync(s => s.State == state);
        Assert.NotNull(consumed.ConsumedAt);
    }

    [Fact]
    public async Task Callback_accepts_uri_prefixed_scope()
    {
        // Microsoft sometimes returns scopes with the resource URI prefix; the
        // normalizer must strip it before comparing against the requested scope set.
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access", "refresh", "https://graph.microsoft.com/Calendars.Read",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("connected=microsoft", response.Headers.Location!.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_accepts_missing_offline_access_in_returned_scope()
    {
        // offline_access is requested but NOT reliably echoed in the access-token scope
        // field. The scope check must ignore meta-scopes; the proof that offline_access
        // was honored is the presence of a refresh_token, which we check separately.
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access", "refresh-present", "Calendars.Read",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("connected=microsoft", response.Headers.Location!.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_with_invalid_state_returns_400()
    {
        using var factory = Factory();
        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync("/v1/schedule/callback/microsoft?code=x&state=does-not-exist");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Callback_with_error_param_redirects_with_error()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token, returnPath: "/oops");

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?error=access_denied&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("/oops", location, StringComparison.Ordinal);
        Assert.Contains("error=access_denied", location, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_with_missing_refresh_token_redirects_with_error()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access", null, "Calendars.Read", DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("error=missing_refresh_token", response.Headers.Location!.ToString(), StringComparison.Ordinal);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        Assert.False(await db.ScheduleSources.AnyAsync(s => s.UserId == seeded.Id));
    }

    [Fact]
    public async Task Callback_with_insufficient_scope_redirects_with_error()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access", "refresh", "User.Read", DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var response = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("error=insufficient_scope", response.Headers.Location!.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Callback_replays_state_with_second_request_returns_400()
    {
        var fake = new FakeMicrosoftCalendarClient();
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var state = await BeginAndCaptureStateAsync(factory, seeded.Token);

        using var client = factory.CreateClient(NoRedirect);
        var first = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, first.StatusCode);

        var second = await client.GetAsync($"/v1/schedule/callback/microsoft?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Callback_upserts_existing_microsoft_source()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnExchange = (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-second", "refresh-second", "Calendars.Read",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();

        var state1 = await BeginAndCaptureStateAsync(factory, seeded.Token);
        using var client = factory.CreateClient(NoRedirect);
        await client.GetAsync($"/v1/schedule/callback/microsoft?code=c1&state={Uri.EscapeDataString(state1)}");

        var state2 = await BeginAndCaptureStateAsync(factory, seeded.Token);
        await client.GetAsync($"/v1/schedule/callback/microsoft?code=c2&state={Uri.EscapeDataString(state2)}");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var sources = await db.ScheduleSources
            .Where(s => s.UserId == seeded.Id && s.Type == ScheduleSourceType.Microsoft)
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
        var response = await client.GetAsync($"/v1/schedule/connect/microsoft?returnPath={Uri.EscapeDataString(returnPath)}");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);

        var state = HttpUtility.ParseQueryString(new Uri(response.Headers.Location!.ToString()).Query)["state"];
        Assert.False(string.IsNullOrEmpty(state));
        return state!;
    }
}
