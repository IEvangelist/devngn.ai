// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Schedule.Google;
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
public sealed class GoogleSyncEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory(FakeGoogleCalendarClient fake) =>
        new(postgres.ConnectionString, configureServices: services =>
        {
            services.RemoveAll<IGoogleCalendarClient>();
            services.AddScoped<IGoogleCalendarClient>(_ => fake);
        });

    [Fact]
    public async Task Sync_happy_path_persists_busy_windows()
    {
        var window = new GoogleBusyWindow(
            DateTimeOffset.UtcNow.AddHours(1),
            DateTimeOffset.UtcNow.AddHours(2));
        var fake = new FakeGoogleCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new GoogleTokenResult(
                "access-fresh", null, "https://www.googleapis.com/auth/calendar.freebusy",
                DateTimeOffset.UtcNow.AddHours(1))),
            OnFreeBusy = (_, _, _, _) => Task.FromResult<IReadOnlyList<GoogleBusyWindow>>([window]),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedGoogleSourceAsync(factory, seeded.Id, "refresh-token-1");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var events = await db.ScheduleEvents.Where(e => e.SourceId == sourceId).ToListAsync();
        Assert.Single(events);
        // Postgres truncates DateTimeOffset to microseconds (vs .NET's 100ns Ticks),
        // so use a 1µs tolerance rather than equality.
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
        var fake = new FakeGoogleCalendarClient
        {
            OnRefresh = (_, _) => throw new GoogleInvalidGrantException("revoked"),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedGoogleSourceAsync(factory, seeded.Id, "refresh-token-2");

        // Pre-populate one future event so we can prove it gets nuked on the failed sync.
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
    public async Task Sync_persists_rotated_refresh_token()
    {
        var fake = new FakeGoogleCalendarClient
        {
            OnRefresh = (_, _) => Task.FromResult(new GoogleTokenResult(
                "access-fresh", "refresh-rotated", "https://www.googleapis.com/auth/calendar.freebusy",
                DateTimeOffset.UtcNow.AddHours(1))),
        };
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedGoogleSourceAsync(factory, seeded.Id, "refresh-token-original");

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
        var source = await db.ScheduleSources.SingleAsync(s => s.Id == sourceId);
        // Decrypt the persisted token — should be the rotated value, not the original.
        Assert.Equal("refresh-rotated", protector.Unprotect(source.ProtectedRefreshToken!));
    }

    [Fact]
    public async Task Sync_on_disabled_source_returns_409()
    {
        var fake = new FakeGoogleCalendarClient();
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedGoogleSourceAsync(factory, seeded.Id, "refresh-token-3",
            status: ScheduleSourceConnectionStatus.Disabled, enabled: false);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{sourceId}/sync", content: null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(0, fake.RefreshCount);
    }

    [Fact]
    public async Task Sync_on_user_source_returns_404()
    {
        var fake = new FakeGoogleCalendarClient();
        using var factory = Factory(fake);
        var seeded = await factory.SeedAuthenticatedUserAsync();

        Guid userSourceId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            var source = new ScheduleSource
            {
                UserId = seeded.Id,
                Type = ScheduleSourceType.User,
                DisplayName = "User-pushed",
                ConnectionStatus = ScheduleSourceConnectionStatus.Connected,
                IsEnabled = true,
            };
            db.ScheduleSources.Add(source);
            await db.SaveChangesAsync();
            userSourceId = source.Id;
        }

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/schedule/sources/{userSourceId}/sync", content: null);
        // The endpoint dispatches by source.Type and only Google is implemented in 7b.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static async Task<Guid> SeedGoogleSourceAsync(
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
            Type = ScheduleSourceType.Google,
            DisplayName = "Google Calendar",
            ProtectedRefreshToken = protector.Protect(refreshToken),
            Scope = "https://www.googleapis.com/auth/calendar.freebusy",
            ConnectionStatus = status,
            IsEnabled = enabled,
            LastRefreshAt = DateTimeOffset.UtcNow.AddHours(-1),
        };
        db.ScheduleSources.Add(source);
        await db.SaveChangesAsync();
        return source.Id;
    }
}
