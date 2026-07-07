// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Identity;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Gamification;

internal static class GamificationEndpoints
{
    public static IEndpointRouteBuilder MapGamificationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/gamification")
            .WithTags("Gamification")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("me", GetPlayerStateAsync)
            .Produces<PlayerStateResponse>()
            .WithName("GetPlayerState");

        group.MapGet("badges", ListBadgesAsync)
            .Produces<IReadOnlyList<BadgeResponse>>()
            .WithName("ListBadges");

        group.MapGet("milestones", ListMilestonesAsync)
            .Produces<IReadOnlyList<MilestoneResponse>>()
            .WithName("ListMilestones");

        group.MapGet("leaderboard", GetLeaderboardAsync)
            .Produces<IReadOnlyList<LeaderboardEntry>>()
            .WithName("GetLeaderboard");

        return app;
    }

    private static async Task<IResult> GetPlayerStateAsync(
        ICurrentUserContext currentUser,
        IGamificationService gamification,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var state = await gamification.GetOrCreatePlayerStateAsync(userId, ct);

        return Results.Ok(new PlayerStateResponse(
            state.Level,
            state.TotalXp,
            LevelCalculator.XpIntoCurrentLevel(state.TotalXp),
            LevelCalculator.XpForNextLevel(state.TotalXp),
            state.CurrentStreak,
            state.LongestStreak,
            state.RankTier));
    }

    private static async Task<IResult> ListBadgesAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        var allBadges = await db.BadgeDefinitions.AsNoTracking().ToListAsync(ct);
        var earned = await db.UserBadges
            .AsNoTracking()
            .Where(ub => ub.UserId == userId)
            .ToDictionaryAsync(ub => ub.BadgeKey, ub => ub.EarnedAt, ct);

        var responses = allBadges.Select(badge =>
        {
            var isEarned = earned.TryGetValue(badge.Key, out var earnedAt);
            // Hidden badges that haven't been earned are anonymized.
            if (badge.IsHidden && !isEarned)
            {
                return new BadgeResponse(
                    Key: badge.Key,
                    Name: "???",
                    Description: "Keep going — there's something hidden here.",
                    Icon: "🔒",
                    Category: "hidden",
                    IsHidden: true,
                    Earned: false,
                    EarnedAt: null);
            }
            return new BadgeResponse(
                badge.Key, badge.Name, badge.Description, badge.Icon, badge.Category,
                badge.IsHidden, isEarned, isEarned ? earnedAt : null);
        }).ToList();

        return Results.Ok(responses);
    }

    private static async Task<IResult> ListMilestonesAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        var all = await db.MilestoneDefinitions.AsNoTracking().ToListAsync(ct);
        var achieved = await db.UserMilestones
            .AsNoTracking()
            .Where(um => um.UserId == userId)
            .ToDictionaryAsync(um => um.MilestoneKey, um => um.AchievedAt, ct);

        var responses = all.Select(m =>
        {
            var isAchieved = achieved.TryGetValue(m.Key, out var achievedAt);
            if (m.IsHidden && !isAchieved)
            {
                return new MilestoneResponse("???", "???", "A hidden milestone awaits.", true, false, null);
            }
            return new MilestoneResponse(
                m.Key, m.Name, m.Description, m.IsHidden, isAchieved,
                isAchieved ? achievedAt : null);
        }).ToList();

        return Results.Ok(responses);
    }

    private static async Task<IResult> GetLeaderboardAsync(
        WellnessDbContext db,
        CancellationToken ct)
    {
        // Only show public players; top 50 by XP.
        var entries = await (
            from ps in db.PlayerStates.AsNoTracking()
            join sp in db.SocialProfiles.AsNoTracking() on ps.UserId equals sp.UserId
            where sp.IsPublic
            orderby ps.TotalXp descending
            select new LeaderboardEntry(
                ps.UserId,
                sp.DisplayName,
                ps.TotalXp,
                ps.Level,
                ps.RankTier)
        ).Take(50).ToListAsync(ct);

        return Results.Ok(entries);
    }
}
