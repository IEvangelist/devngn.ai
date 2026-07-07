// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Text.Json;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Gamification;

/// <summary>
/// Default <see cref="IGamificationService"/>. Scoped so it shares the
/// request's <see cref="WellnessDbContext"/>.
/// </summary>
internal sealed class GamificationService(
    WellnessDbContext db,
    TimeProvider clock,
    ILogger<GamificationService> logger) : IGamificationService
{
    private const int MaxAwardXpConcurrencyAttempts = 3;

    /// <inheritdoc/>
    public async Task AwardXpAsync(Guid userId, int amount, XpReason reason, CancellationToken ct = default)
    {
        if (amount <= 0)
        {
            return;
        }

        var state = await GetOrCreatePlayerStateAsync(userId, ct);
        db.XpEvents.Add(new XpEvent { UserId = userId, Amount = amount, Reason = reason, CreatedAt = clock.GetUtcNow() });

        for (var attempt = 1; attempt <= MaxAwardXpConcurrencyAttempts; attempt++)
        {
            var previousLevel = state.Level;
            ApplyXpDelta(state, amount);

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (attempt == MaxAwardXpConcurrencyAttempts || !IsPlayerStateConcurrencyException(ex))
                {
                    logger.LogError(
                        ex,
                        "Failed to award {Amount} XP to user {UserId} after {Attempt} attempt(s).",
                        amount,
                        userId,
                        attempt);
                    throw;
                }

                logger.LogWarning(
                    ex,
                    "Concurrency conflict awarding {Amount} XP to user {UserId}; retrying attempt {NextAttempt} of {MaxAttempts}.",
                    amount,
                    userId,
                    attempt + 1,
                    MaxAwardXpConcurrencyAttempts);
                await ReloadPlayerStateEntriesAsync(ex, ct);
                continue;
            }

            // Emit a level-up feed item when the player crosses a level boundary.
            if (state.Level > previousLevel)
            {
                await AddFeedItemAsync(userId, FeedItemType.LevelUp,
                    $"You reached level {state.Level}!", ct);
                await db.SaveChangesAsync(ct);
            }

            return;
        }
    }

    /// <inheritdoc/>
    public async Task UpdateStreakAsync(Guid userId, DateOnly today, CancellationToken ct = default)
    {
        var state = await GetOrCreatePlayerStateAsync(userId, ct);

        if (state.LastActivityOn == today)
        {
            // Already active today — no update needed.
            return;
        }

        if (state.LastActivityOn == today.AddDays(-1))
        {
            // Consecutive day — extend the streak.
            state.CurrentStreak++;
        }
        else
        {
            // Gap in activity — reset streak to 1.
            state.CurrentStreak = 1;
        }

        state.LastActivityOn = today;
        state.LongestStreak = Math.Max(state.LongestStreak, state.CurrentStreak);

        await db.SaveChangesAsync(ct);

        // Award a streak bonus every 7 consecutive days.
        if (state.CurrentStreak % 7 == 0)
        {
            await AwardXpAsync(userId, 50, XpReason.StreakBonus, ct);
        }
    }

    /// <inheritdoc/>
    public async Task EvaluateBadgesAsync(Guid userId, CancellationToken ct = default)
    {
        var state = await GetOrCreatePlayerStateAsync(userId, ct);

        var allBadges = await db.BadgeDefinitions.AsNoTracking().ToListAsync(ct);
        if (allBadges.Count == 0)
        {
            return;
        }

        var earned = await db.UserBadges
            .AsNoTracking()
            .Where(ub => ub.UserId == userId)
            .Select(ub => ub.BadgeKey)
            .ToHashSetAsync(ct);

        var promptCount = await db.Prompts.AsNoTracking().CountAsync(p => p.UserId == userId, ct);
        var goalCount = await db.Goals.AsNoTracking().CountAsync(g => g.UserId == userId, ct);

        var now = clock.GetUtcNow();
        var anyNew = false;

        foreach (var badge in allBadges)
        {
            if (earned.Contains(badge.Key))
            {
                continue;
            }

            var unlocked = badge.Key switch
            {
                "first-steps" => promptCount >= 1,
                "centurion" => state.TotalXp >= 100,
                "five-hundred" => state.TotalXp >= 500,
                "legend-status" => state.TotalXp >= 5000,
                "goal-setter" => goalCount >= 3,
                "bronze-achiever" => state.Level >= 1,
                "silver-achiever" => state.Level >= 5,
                "gold-achiever" => state.Level >= 10,
                "seven-day-streak" => state.LongestStreak >= 7,
                "thirty-day-streak" => state.LongestStreak >= 30,
                // Hidden badges below — evaluated by specific criteria
                "night-owl" => await IsNightOwlEligibleAsync(userId, ct),
                "comeback-streak" => await IsComebackStreakEligibleAsync(userId, ct),
                _ => state.TotalXp >= badge.XpThreshold && badge.XpThreshold > 0,
            };

            if (!unlocked)
            {
                continue;
            }

            db.UserBadges.Add(new UserBadge
            {
                UserId = userId,
                BadgeKey = badge.Key,
                EarnedAt = now,
            });
            anyNew = true;
            earned.Add(badge.Key);
            logger.LogInformation("User {UserId} unlocked badge '{Badge}'.", userId, badge.Key);

            await AddFeedItemAsync(userId, FeedItemType.BadgeEarned,
                $"Badge unlocked: {badge.Name}!", ct);
        }

        if (anyNew)
        {
            await db.SaveChangesAsync(ct);
        }
    }

    /// <inheritdoc/>
    public async Task EvaluateMilestonesAsync(Guid userId, CancellationToken ct = default)
    {
        var allMilestones = await db.MilestoneDefinitions.AsNoTracking().ToListAsync(ct);
        if (allMilestones.Count == 0)
        {
            return;
        }

        var achieved = await db.UserMilestones
            .AsNoTracking()
            .Where(um => um.UserId == userId)
            .Select(um => um.MilestoneKey)
            .ToHashSetAsync(ct);

        var promptCount = await db.Prompts.AsNoTracking().CountAsync(p => p.UserId == userId, ct);
        var followCount = await db.Follows.AsNoTracking().CountAsync(f => f.FollowerId == userId, ct);
        var state = await GetOrCreatePlayerStateAsync(userId, ct);

        var now = clock.GetUtcNow();
        var anyNew = false;

        foreach (var milestone in allMilestones)
        {
            if (achieved.Contains(milestone.Key))
            {
                continue;
            }

            var unlocked = milestone.Key switch
            {
                "first-prompt" => promptCount >= 1,
                "ten-prompts" => promptCount >= 10,
                "fifty-prompts" => promptCount >= 50,
                "hundred-prompts" => promptCount >= 100,
                "first-week" => state.LongestStreak >= 7,
                "social-butterfly" => followCount >= 5,
                "hidden-marathon" => promptCount >= 1000,
                _ => false,
            };

            if (!unlocked)
            {
                continue;
            }

            db.UserMilestones.Add(new UserMilestone
            {
                UserId = userId,
                MilestoneKey = milestone.Key,
                AchievedAt = now,
            });
            anyNew = true;
            achieved.Add(milestone.Key);
            logger.LogInformation("User {UserId} achieved milestone '{Milestone}'.", userId, milestone.Key);

            await AddFeedItemAsync(userId, FeedItemType.MilestoneAchieved,
                $"Milestone achieved: {milestone.Name}!", ct);
        }

        if (anyNew)
        {
            await db.SaveChangesAsync(ct);
        }
    }

    /// <inheritdoc/>
    public async Task<PlayerState> GetOrCreatePlayerStateAsync(Guid userId, CancellationToken ct = default)
    {
        var state = await db.PlayerStates.FindAsync([userId], ct);
        if (state is null)
        {
            state = new PlayerState { UserId = userId };
            db.PlayerStates.Add(state);
            await db.SaveChangesAsync(ct);
        }
        return state;
    }

    private async Task AddFeedItemAsync(Guid userId, FeedItemType type, string message, CancellationToken ct)
    {
        db.ActivityFeedItems.Add(new ActivityFeedItem
        {
            UserId = userId,
            Type = type,
            Message = message,
            CreatedAt = clock.GetUtcNow(),
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task<bool> IsNightOwlEligibleAsync(Guid userId, CancellationToken ct)
    {
        // Eligible if any prompt was delivered between 22:00 and 02:00 UTC.
        var cutoff = clock.GetUtcNow().AddDays(-90);
        var deliveries = await db.Prompts
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.DeliveredAt >= cutoff)
            .Select(p => p.DeliveredAt)
            .ToListAsync(ct);

        return deliveries.Any(d => d.UtcDateTime.Hour is >= 22 or < 2);
    }

    private static void ApplyXpDelta(PlayerState state, int amount)
    {
        state.TotalXp += amount;
        state.Level = LevelCalculator.ComputeLevel(state.TotalXp);
        state.RankTier = LevelCalculator.ComputeRankTier(state.Level);
    }

    private static bool IsPlayerStateConcurrencyException(DbUpdateConcurrencyException ex) =>
        ex.Entries.Count > 0 && ex.Entries.All(static e => e.Entity is PlayerState);

    private static async Task ReloadPlayerStateEntriesAsync(
        DbUpdateConcurrencyException ex,
        CancellationToken ct)
    {
        foreach (var entry in ex.Entries)
        {
            await entry.ReloadAsync(ct);
        }
    }

    private async Task<bool> IsComebackStreakEligibleAsync(Guid userId, CancellationToken ct)
    {
        // Eligible if the user had a gap of >= 3 days in their XP events and then resumed.
        var recent = await db.XpEvents
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderBy(x => x.CreatedAt)
            .Select(x => x.CreatedAt)
            .ToListAsync(ct);

        for (var i = 1; i < recent.Count; i++)
        {
            var gap = (recent[i] - recent[i - 1]).TotalDays;
            if (gap >= 3 && i < recent.Count - 1)
            {
                return true;
            }
        }
        return false;
    }
}
