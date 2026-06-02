// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Schedule.Microsoft;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class MicrosoftSyncEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory(FakeMicrosoftCalendarClient fake) =>
        new(postgres.ConnectionString, configureServices: services =>
        {
            services.RemoveAll<IMicrosoftCalendarClient>();
            services.AddScoped<IMicrosoftCalendarClient>(_ => fake);
        });

    [Fact]
    public async Task Sync_happy_path_persists_busy_windows()
    {
        var window = new MicrosoftBusyWindow(
            DateTimeOffset.UtcNow.AddHours(1),
            DateTimeOffset.UtcNow.AddHours(2));
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-fresh", null, "Calendars.Read", DateTimeOffset.UtcNow.AddHours(1))),
            OnBusy = (_, _, _, _) => Task.FromResult<IReadOnlyList<MicrosoftBusyWindow>>([window]),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-1");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var events = await db.ScheduleEvents.Where(e => e.SourceId == sourceId).ToListAsync();
        Assert.Single(events);
        Assert.True((events[0].StartUtc - window.StartUtc).Duration() < TimeSpan.FromMicroseconds(1));
        Assert.True((events[0].EndUtc - window.EndUtc).Duration() < TimeSpan.FromMicroseconds(1));

        var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
        Assert.Equal(ScheduleSourceConnectionStatus.Connected, source.ConnectionStatus);
        Assert.NotNull(source.LastSyncAt);
        Assert.Null(source.LastSyncErrorCode);
    }

    [Fact]
    public async Task Sync_with_invalid_grant_marks_needsReconnect_and_deletes_future_events()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => throw new MicrosoftInvalidGrantException("AADSTS70008: refresh token expired"),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-2");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            db.ScheduleEvents.Add(new ScheduleEvent
            {
                UserId = seeded.Id,
                SourceId = sourceId,
                StartUtc = DateTimeOffset.UtcNow.AddHours(1),
                EndUtc = DateTimeOffset.UtcNow.AddHours(2),
                Busy = true,
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
            Assert.Equal(ScheduleSourceConnectionStatus.NeedsReconnect, source.ConnectionStatus);
            Assert.Equal("invalid_grant", source.LastSyncErrorCode);
            Assert.False(await db.ScheduleEvents.AnyAsync(e => e.SourceId == sourceId));
        }
    }

    [Fact]
    public async Task Sync_with_403_marks_error_and_preserves_future_events()
    {
        // 403 = tenant policy / conditional access. Per rubber-duck #1, do NOT mark
        // NeedsReconnect and do NOT delete events — the refresh token is still valid.
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-fresh", null, "Calendars.Read", DateTimeOffset.UtcNow.AddHours(1))),
            OnBusy = (_, _, _, _) => throw new MicrosoftForbiddenException("policy block"),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-3");

        DateTimeOffset preserved;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            preserved = DateTimeOffset.UtcNow.AddHours(1);
            db.ScheduleEvents.Add(new ScheduleEvent
            {
                UserId = seeded.Id,
                SourceId = sourceId,
                StartUtc = preserved,
                EndUtc = preserved.AddHours(1),
                Busy = true,
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
            Assert.Equal(ScheduleSourceConnectionStatus.Error, source.ConnectionStatus);
            Assert.Equal("forbidden", source.LastSyncErrorCode);
            // The pre-seeded future event must still be there.
            Assert.True(await db.ScheduleEvents.AnyAsync(e => e.SourceId == sourceId));
        }
    }

    [Fact]
    public async Task Sync_with_transient_token_marks_error_and_does_not_call_calendar()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => throw new MicrosoftTransientException("graph 503"),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-4");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(0, fake.BusyCount);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
        Assert.Equal(ScheduleSourceConnectionStatus.Error, source.ConnectionStatus);
        Assert.Equal("transient_token", source.LastSyncErrorCode);
    }

    [Fact]
    public async Task Sync_persists_rotated_refresh_token()
    {
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-fresh", "refresh-rotated", "Calendars.Read",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-original");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
        Assert.Equal("refresh-rotated", protector.Unprotect(source.ProtectedRefreshToken!));
    }

    [Fact]
    public async Task Sync_preserves_existing_refresh_token_when_response_omits_one()
    {
        // Per rubber-duck #7: when MS returns a refresh response with no refresh_token,
        // the existing stored token must be preserved verbatim — not overwritten with null.
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new MicrosoftTokenResult(
                "access-fresh", null, "Calendars.Read",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-keep-me");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
        Assert.NotNull(source.ProtectedRefreshToken);
        Assert.Equal("refresh-keep-me", protector.Unprotect(source.ProtectedRefreshToken!));
    }

    [Fact]
    public async Task Sync_on_disabled_source_returns_409()
    {
        var fake = new FakeMicrosoftCalendarClient();
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-5",
            status: ScheduleSourceConnectionStatus.Disabled, enabled: false);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(0, fake.RefreshCount);
    }

    [Fact]
    public async Task Sync_routes_microsoft_source_to_microsoft_service()
    {
        // Defensive: prove the dispatcher in ScheduleSourceEndpoints.SyncAsync sends
        // ScheduleSourceType.Microsoft to the Microsoft sync, not Google's.
        var fake = new FakeMicrosoftCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new MicrosoftTokenResult(
                "a", null, "Calendars.Read", DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedMicrosoftSourceAsync(factory, seeded.Id, "refresh-route");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, fake.RefreshCount);
        Assert.Equal(1, fake.BusyCount);
    }

    private static async Task<Guid> SeedMicrosoftSourceAsync(
        AuthWebAppFactory factory,
        Guid userId,
        string refreshToken,
        ScheduleSourceConnectionStatus status = ScheduleSourceConnectionStatus.Connected,
        bool enabled = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = new ScheduleSource
        {
            UserId = userId,
            Type = ScheduleSourceType.Microsoft,
            DisplayName = "Microsoft Calendar",
            ProtectedRefreshToken = protector.Protect(refreshToken),
            Scope = "Calendars.Read",
            ConnectionStatus = status,
            IsEnabled = enabled,
            LastRefreshAt = DateTimeOffset.UtcNow.AddHours(-1),
        };
        db.ScheduleSources.Add(source);
        await db.SaveChangesAsync();
        return source.Id;
    }
}
