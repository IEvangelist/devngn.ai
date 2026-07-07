// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Gamification;

internal sealed record PlayerStateResponse(
    int Level,
    int TotalXp,
    int XpIntoLevel,
    int XpForNextLevel,
    int CurrentStreak,
    int LongestStreak,
    RankTier RankTier);

internal sealed record BadgeResponse(
    string Key,
    string Name,
    string Description,
    string Icon,
    string Category,
    bool IsHidden,
    bool Earned,
    DateTimeOffset? EarnedAt);

internal sealed record MilestoneResponse(
    string Key,
    string Name,
    string Description,
    bool IsHidden,
    bool Achieved,
    DateTimeOffset? AchievedAt);

internal sealed record LeaderboardEntry(
    Guid UserId,
    string DisplayName,
    int TotalXp,
    int Level,
    RankTier RankTier);
