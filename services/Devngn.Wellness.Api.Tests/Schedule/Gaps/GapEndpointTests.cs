// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Schedule.Gaps;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule.Gaps;

/// <summary>
/// Integration tests for <c>GET /v1/gaps</c>. The test window is anchored to
/// 2026-06-15 — a date guaranteed to be in the future relative to the real wall
/// clock at the time these tests were authored — so the engine's <c>ClipByNow</c>
/// stage is a no-op without having to override <see cref="TimeProvider"/> in DI
/// (overriding it globally would also reject JWT bearer tokens as expired).
/// The pure engine is unit-tested separately in <c>GapDetectorTests</c>.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GapEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory(Action<IDictionary<string, string?>>? extraConfig = null) =>
        new(postgres.ConnectionString, configureConfig: extraConfig);

    [Fact]
    public async Task Get_with_no_busy_events_returns_full_business_day_capped_at_max()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var gaps = await response.Content.ReadFromJsonAsync<List<GapResponse>>();
        Assert.NotNull(gaps);
        var gap = Assert.Single(gaps!);
        // No events + allowed-hours 9-17 + MaxGapMinutes 60 → 09:00-10:00 only.
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 9, 0, 0, TimeSpan.Zero), gap.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 10, 0, 0, TimeSpan.Zero), gap.EndUtc);
        Assert.Equal(60, gap.DurationMinutes);
    }

    [Fact]
    public async Task Get_with_two_meetings_returns_three_capped_gaps()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedUserSourceAsync(factory, seeded.Id, ScheduleSourceConnectionStatus.Connected, enabled: true);
        await SeedBusyEventAsync(factory, seeded.Id, sourceId,
            start: new DateTimeOffset(2026, 6, 15, 10, 30, 0, TimeSpan.Zero),
            end: new DateTimeOffset(2026, 6, 15, 11, 30, 0, TimeSpan.Zero));
        await SeedBusyEventAsync(factory, seeded.Id, sourceId,
            start: new DateTimeOffset(2026, 6, 15, 13, 30, 0, TimeSpan.Zero),
            end: new DateTimeOffset(2026, 6, 15, 14, 30, 0, TimeSpan.Zero));

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var gaps = await response.Content.ReadFromJsonAsync<List<GapResponse>>();
        Assert.NotNull(gaps);
        Assert.Equal(3, gaps!.Count);
        // Raw segments: 09:00-10:30, 11:30-13:30, 14:30-17:00. Cap each to 60m.
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 9, 0, 0, TimeSpan.Zero), gaps[0].StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 10, 0, 0, TimeSpan.Zero), gaps[0].EndUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 11, 30, 0, TimeSpan.Zero), gaps[1].StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 12, 30, 0, TimeSpan.Zero), gaps[1].EndUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 14, 30, 0, TimeSpan.Zero), gaps[2].StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 15, 30, 0, TimeSpan.Zero), gaps[2].EndUtc);
    }

    [Fact]
    public async Task Get_excludes_events_from_disabled_sources()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var disabledSource = await SeedUserSourceAsync(factory, seeded.Id,
            ScheduleSourceConnectionStatus.Disabled, enabled: false);
        // Insert a busy event on the disabled source that *would* have split the day —
        // the gap detector must not see it.
        await SeedBusyEventAsync(factory, seeded.Id, disabledSource,
            start: new DateTimeOffset(2026, 6, 15, 11, 0, 0, TimeSpan.Zero),
            end: new DateTimeOffset(2026, 6, 15, 12, 0, 0, TimeSpan.Zero));

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var gaps = await response.Content.ReadFromJsonAsync<List<GapResponse>>();
        Assert.NotNull(gaps);
        var gap = Assert.Single(gaps!);
        // Same shape as the no-events case — the disabled-source busy event was filtered.
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 9, 0, 0, TimeSpan.Zero), gap.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 10, 0, 0, TimeSpan.Zero), gap.EndUtc);
    }

    [Fact]
    public async Task Get_excludes_free_events_even_when_persisted()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var sourceId = await SeedUserSourceAsync(factory, seeded.Id, ScheduleSourceConnectionStatus.Connected, enabled: true);
        // Phase 7 only persists busy windows, but the endpoint filters defensively. Insert a
        // free event right in the middle of the day and verify it doesn't split the gap.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            db.ScheduleEvents.Add(new ScheduleEvent
            {
                UserId = seeded.Id,
                SourceId = sourceId,
                StartUtc = new DateTimeOffset(2026, 6, 15, 11, 0, 0, TimeSpan.Zero),
                EndUtc = new DateTimeOffset(2026, 6, 15, 12, 0, 0, TimeSpan.Zero),
                Busy = false,
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var gaps = await response.Content.ReadFromJsonAsync<List<GapResponse>>();
        Assert.NotNull(gaps);
        var gap = Assert.Single(gaps!);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 9, 0, 0, TimeSpan.Zero), gap.StartUtc);
    }

    [Fact]
    public async Task Get_without_auth_returns_401()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_without_consent_returns_403()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_with_to_before_from_returns_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T17:00:00Z&to=2026-06-15T09:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_with_window_over_max_returns_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        // 15-day window exceeds the 14-day cap.
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-01T00:00:00Z&to=2026-06-16T00:00:01Z&tz=UTC");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_with_unknown_timezone_returns_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=Made/UpZone");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_shifts_first_gap_past_cooldown_after_a_recent_prompt()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        // A prompt delivered at 09:15 with the default 30-minute cooldown pushes the
        // 09:00 free interval's start to 09:45 (then capped to a 60-minute window).
        await SeedPromptAsync(factory, seeded.Id, activityId,
            new DateTimeOffset(2026, 6, 15, 9, 15, 0, TimeSpan.Zero));

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync(
            $"/v1/gaps?from=2026-06-15T09:00:00Z&to=2026-06-15T17:00:00Z&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var gaps = await response.Content.ReadFromJsonAsync<List<GapResponse>>();
        Assert.NotNull(gaps);
        var first = gaps![0];
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 9, 45, 0, TimeSpan.Zero), first.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 10, 45, 0, TimeSpan.Zero), first.EndUtc);
    }

    private static async Task<Guid> SeedUserSourceAsync(
        AuthWebAppFactory factory,
        Guid userId,
        ScheduleSourceConnectionStatus status,
        bool enabled)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var src = new ScheduleSource
        {
            UserId = userId,
            Type = ScheduleSourceType.User,
            DisplayName = "Test-source",
            ConnectionStatus = status,
            IsEnabled = enabled,
        };
        db.ScheduleSources.Add(src);
        await db.SaveChangesAsync();
        return src.Id;
    }

    private static async Task SeedBusyEventAsync(
        AuthWebAppFactory factory,
        Guid userId,
        Guid sourceId,
        DateTimeOffset start,
        DateTimeOffset end)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        db.ScheduleEvents.Add(new ScheduleEvent
        {
            UserId = userId,
            SourceId = sourceId,
            StartUtc = start,
            EndUtc = end,
            Busy = true,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedActivityAsync(AuthWebAppFactory factory)
    {
        var slug = $"test-{Guid.NewGuid():N}";
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var activity = new Activity
        {
            Slug = slug,
            Title = slug,
            Description = "Test activity",
            BodyArea = BodyArea.Core,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 30,
            EquipmentTags = [],
            AnimationProvider = "local",
            AnimationAssetId = slug,
        };
        db.Activities.Add(activity);
        await db.SaveChangesAsync();
        return activity.Id;
    }

    private static async Task SeedPromptAsync(
        AuthWebAppFactory factory,
        Guid userId,
        Guid activityId,
        DateTimeOffset deliveredAt)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        db.Prompts.Add(new Prompt
        {
            UserId = userId,
            ActivityId = activityId,
            GapStartUtc = deliveredAt,
            GapEndUtc = deliveredAt.AddMinutes(30),
            DeliveredAt = deliveredAt,
            DeliveredVia = DeliveryChannel.Web,
        });
        await db.SaveChangesAsync();
    }
}
