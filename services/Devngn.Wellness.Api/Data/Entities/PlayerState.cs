// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Current gamification state for a user: XP, level, streak, and rank.
/// One row per user; created on first XP award.
/// </summary>
public sealed class PlayerState
{
    public Guid UserId { get; set; }

    public int TotalXp { get; set; }

    public int Level { get; set; } = 1;

    public int CurrentStreak { get; set; }

    public int LongestStreak { get; set; }

    public DateOnly? LastActivityOn { get; set; }

    public RankTier RankTier { get; set; } = RankTier.Bronze;
}
