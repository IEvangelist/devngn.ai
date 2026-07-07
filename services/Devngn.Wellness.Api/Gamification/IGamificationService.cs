// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Gamification;

/// <summary>
/// Gamification domain operations: XP awards, streak tracking, badge/milestone evaluation.
/// Registered as scoped so it shares the request's <c>WellnessDbContext</c>.
/// </summary>
internal interface IGamificationService
{
    /// <summary>Awards XP and recomputes level/rank for the user.</summary>
    Task AwardXpAsync(Guid userId, int amount, XpReason reason, CancellationToken ct = default);

    /// <summary>
    /// Updates the daily streak for the user based on <paramref name="today"/>.
    /// A streak increments if the user was active yesterday; resets if they missed a day;
    /// is unchanged if they already have an activity recorded today.
    /// </summary>
    Task UpdateStreakAsync(Guid userId, DateOnly today, CancellationToken ct = default);

    /// <summary>Evaluates all badge criteria and unlocks newly eligible badges.</summary>
    Task EvaluateBadgesAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Evaluates milestone thresholds and records newly achieved milestones.</summary>
    Task EvaluateMilestonesAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Returns the player state row, creating it if this is the user's first activity.</summary>
    Task<PlayerState> GetOrCreatePlayerStateAsync(Guid userId, CancellationToken ct = default);
}
