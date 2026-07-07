// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Gamification;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Gamification;

/// <summary>
/// Integration tests for badge and milestone unlock behaviour in
/// <see cref="IGamificationService"/> and the listing endpoints.
/// Requires Docker/Postgres (badge/milestone definitions are seeded at startup).
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GamificationBadgeMilestoneTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    // -------------------------------------------------------------------------
    // Badge unlock — idempotent: earning the same badge twice creates one row
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EvaluateBadges_CenturionBadge_UnlockedExactlyOnce()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        // Give the user exactly 100 XP so the "centurion" badge becomes eligible.
        await AwardXpAsync(factory, userId, 100, XpReason.PromptCompleted);

        // Evaluate badges twice — should only insert one UserBadge row.
        await EvaluateBadgesAsync(factory, userId);
        await EvaluateBadgesAsync(factory, userId);

        var badgeCount = await CountUserBadgeAsync(factory, userId, "centurion");
        Assert.Equal(1, badgeCount);
    }

    // -------------------------------------------------------------------------
    // Badge listing — hidden badge is anonymized until earned
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ListBadges_HiddenBadgeUnearnedThenEarned_AnonThenRevealed()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // Before earning: the hidden "night-owl" badge must be anonymized.
        var badges = await client.GetFromJsonAsync<List<BadgeDtoGlobal>>("/v1/gamification/badges");
        Assert.NotNull(badges);
        var nightOwl = badges!.SingleOrDefault(b => b.Key == "night-owl");
        Assert.NotNull(nightOwl);
        Assert.Equal("???", nightOwl!.Name);
        Assert.False(nightOwl.Earned);

        // Manually insert the earned badge row to simulate the unlock.
        await InsertUserBadgeAsync(factory, seeded.Id, "night-owl");

        // After earning: the badge is no longer anonymized.
        var badgesAfter = await client.GetFromJsonAsync<List<BadgeDtoGlobal>>("/v1/gamification/badges");
        Assert.NotNull(badgesAfter);
        var nightOwlAfter = badgesAfter!.SingleOrDefault(b => b.Key == "night-owl");
        Assert.NotNull(nightOwlAfter);
        Assert.NotEqual("???", nightOwlAfter!.Name);
        Assert.True(nightOwlAfter.Earned);
    }

    // -------------------------------------------------------------------------
    // Milestone unlock — idempotent: achieving "first-prompt" twice creates one row
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EvaluateMilestones_FirstPromptMilestone_AchievedExactlyOnce()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var userId = seeded.Id;

        // Seed a prompt so the "first-prompt" milestone is eligible.
        await SeedPromptAsync(factory, userId);

        await EvaluateMilestonesAsync(factory, userId);
        await EvaluateMilestonesAsync(factory, userId);

        var milestoneCount = await CountUserMilestoneAsync(factory, userId, "first-prompt");
        Assert.Equal(1, milestoneCount);
    }

    // -------------------------------------------------------------------------
    // Milestone listing — hidden milestone is anonymized until achieved
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ListMilestones_HiddenMilestoneUnearnedThenAchieved_AnonThenRevealed()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // Before achieving: hidden unachieved milestones have Key="???" (both key and name
        // are obscured for milestones, unlike badges which only obscure name/icon).
        var milestones = await client.GetFromJsonAsync<List<MilestoneDtoGlobal>>("/v1/gamification/milestones");
        Assert.NotNull(milestones);
        var anonymized = milestones!.Where(m => m.IsHidden && !m.Achieved).ToList();
        Assert.NotEmpty(anonymized);
        Assert.All(anonymized, m =>
        {
            Assert.Equal("???", m.Key);
            Assert.Equal("???", m.Name);
            Assert.False(m.Achieved);
        });

        // Simulate achievement by inserting the record directly.
        await InsertUserMilestoneAsync(factory, seeded.Id, "hidden-marathon");

        // After achieving: the milestone is revealed with its real key and name.
        var milestonesAfter = await client.GetFromJsonAsync<List<MilestoneDtoGlobal>>("/v1/gamification/milestones");
        Assert.NotNull(milestonesAfter);
        var hiddenAfter = milestonesAfter!.SingleOrDefault(m => m.Key == "hidden-marathon");
        Assert.NotNull(hiddenAfter);
        Assert.NotEqual("???", hiddenAfter!.Name);
        Assert.True(hiddenAfter.Achieved);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static async Task AwardXpAsync(AuthWebAppFactory factory, Guid userId, int amount, XpReason reason)
    {
        using var scope = factory.Services.CreateScope();
        var gamification = scope.ServiceProvider.GetRequiredService<IGamificationService>();
        await gamification.AwardXpAsync(userId, amount, reason);
    }

    private static async Task EvaluateBadgesAsync(AuthWebAppFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var gamification = scope.ServiceProvider.GetRequiredService<IGamificationService>();
        await gamification.EvaluateBadgesAsync(userId);
    }

    private static async Task EvaluateMilestonesAsync(AuthWebAppFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var gamification = scope.ServiceProvider.GetRequiredService<IGamificationService>();
        await gamification.EvaluateMilestonesAsync(userId);
    }

    private static async Task<int> CountUserBadgeAsync(AuthWebAppFactory factory, Guid userId, string badgeKey)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        return await db.UserBadges.CountAsync(ub => ub.UserId == userId && ub.BadgeKey == badgeKey);
    }

    private static async Task<int> CountUserMilestoneAsync(AuthWebAppFactory factory, Guid userId, string milestoneKey)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        return await db.UserMilestones.CountAsync(um => um.UserId == userId && um.MilestoneKey == milestoneKey);
    }

    private static async Task InsertUserBadgeAsync(AuthWebAppFactory factory, Guid userId, string badgeKey)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        db.UserBadges.Add(new UserBadge { UserId = userId, BadgeKey = badgeKey, EarnedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    }

    private static async Task InsertUserMilestoneAsync(AuthWebAppFactory factory, Guid userId, string milestoneKey)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        db.UserMilestones.Add(new UserMilestone { UserId = userId, MilestoneKey = milestoneKey, AchievedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    }

    private static async Task SeedPromptAsync(AuthWebAppFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var activitySlug = $"test-{Guid.NewGuid():N}";
        var activity = new Activity
        {
            Slug = activitySlug,
            Title = activitySlug,
            Description = "Test activity",
            BodyArea = BodyArea.Core,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 30,
            EquipmentTags = [],
            AnimationProvider = "local",
            AnimationAssetId = activitySlug,
        };
        db.Activities.Add(activity);
        await db.SaveChangesAsync();

        db.Prompts.Add(new Prompt
        {
            UserId = userId,
            ActivityId = activity.Id,
            GapStartUtc = DateTimeOffset.UtcNow,
            GapEndUtc = DateTimeOffset.UtcNow.AddMinutes(30),
            DeliveredAt = DateTimeOffset.UtcNow,
            DeliveredVia = DeliveryChannel.Web,
        });
        await db.SaveChangesAsync();
    }

    private sealed record BadgeDtoGlobal(string Key, string Name, string Description, string Icon, string Category, bool IsHidden, bool Earned, DateTimeOffset? EarnedAt);
    private sealed record MilestoneDtoGlobal(string Key, string Name, string Description, bool IsHidden, bool Achieved, DateTimeOffset? AchievedAt);
}
