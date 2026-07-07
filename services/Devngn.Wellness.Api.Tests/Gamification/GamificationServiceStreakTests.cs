// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Gamification;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Gamification;

/// <summary>
/// Integration tests for streak-tracking logic in <see cref="IGamificationService"/>.
/// These tests call the service directly via a DI scope rather than via HTTP so the
/// assertions are precise and fast. Docker/Postgres is required.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GamificationServiceStreakTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    // -------------------------------------------------------------------------
    // UpdateStreakAsync — consecutive day increments streak
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStreak_ConsecutiveDays_IncrementsStreak()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        var day1 = new DateOnly(2026, 1, 1);
        var day2 = day1.AddDays(1);

        await InvokeStreakAsync(factory, userId, day1);
        await InvokeStreakAsync(factory, userId, day2);

        var state = await GetPlayerStateAsync(factory, userId);
        Assert.Equal(2, state.CurrentStreak);
        Assert.Equal(2, state.LongestStreak);
        Assert.Equal(day2, state.LastActivityOn);
    }

    // -------------------------------------------------------------------------
    // UpdateStreakAsync — same day call does not double-count
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStreak_SameDayTwice_DoesNotIncrementStreak()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        var today = new DateOnly(2026, 3, 15);

        await InvokeStreakAsync(factory, userId, today);
        await InvokeStreakAsync(factory, userId, today); // duplicate call same day

        var state = await GetPlayerStateAsync(factory, userId);
        Assert.Equal(1, state.CurrentStreak);
        Assert.Equal(1, state.LongestStreak);
    }

    // -------------------------------------------------------------------------
    // UpdateStreakAsync — gap in activity resets streak to 1
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStreak_GapInActivity_ResetsStreakToOne()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        var day1 = new DateOnly(2026, 2, 1);
        var day2 = day1.AddDays(1);
        var dayAfterGap = day2.AddDays(2); // skipped day2+1

        await InvokeStreakAsync(factory, userId, day1);
        await InvokeStreakAsync(factory, userId, day2);
        await InvokeStreakAsync(factory, userId, dayAfterGap);

        var state = await GetPlayerStateAsync(factory, userId);
        // Streak was broken: reset to 1 on dayAfterGap.
        Assert.Equal(1, state.CurrentStreak);
    }

    // -------------------------------------------------------------------------
    // UpdateStreakAsync — longestStreak is retained when current streak drops
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStreak_GapAfterLongRun_RetainsLongestStreak()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        // Build a 3-day streak.
        var start = new DateOnly(2026, 4, 1);
        for (var i = 0; i < 3; i++)
        {
            await InvokeStreakAsync(factory, userId, start.AddDays(i));
        }

        // Break the streak and resume.
        var afterBreak = start.AddDays(5);
        await InvokeStreakAsync(factory, userId, afterBreak);

        var state = await GetPlayerStateAsync(factory, userId);
        Assert.Equal(1, state.CurrentStreak);
        Assert.Equal(3, state.LongestStreak); // longest retained
    }

    // -------------------------------------------------------------------------
    // UpdateStreakAsync — 7-day streak awards bonus XP
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateStreak_SevenConsecutiveDays_AwardsStreakBonusXp()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        var start = new DateOnly(2026, 5, 1);
        for (var i = 0; i < 7; i++)
        {
            await InvokeStreakAsync(factory, userId, start.AddDays(i));
        }

        var state = await GetPlayerStateAsync(factory, userId);
        Assert.Equal(7, state.CurrentStreak);
        // 7-day streak triggers a 50 XP bonus.
        Assert.Equal(50, state.TotalXp);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static async Task InvokeStreakAsync(AuthWebAppFactory factory, Guid userId, DateOnly day)
    {
        using var scope = factory.Services.CreateScope();
        var gamification = scope.ServiceProvider.GetRequiredService<IGamificationService>();
        await gamification.UpdateStreakAsync(userId, day);
    }

    private static async Task<Devngn.Wellness.Api.Data.Entities.PlayerState> GetPlayerStateAsync(
        AuthWebAppFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var state = await db.PlayerStates.FindAsync(userId);
        Assert.NotNull(state);
        return state!;
    }
}
