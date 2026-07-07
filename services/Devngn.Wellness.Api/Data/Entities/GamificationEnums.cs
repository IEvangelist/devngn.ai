// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>Reason an <see cref="XpEvent"/> was awarded.</summary>
public enum XpReason
{
    PromptCompleted,
    GoalCreated,
    ProfileCompleted,
    StreakBonus,
    BadgeUnlocked,
    MilestoneAchieved,
    SocialFollowed,
}

/// <summary>Rank tier derived from the player's current level.</summary>
public enum RankTier
{
    Bronze,
    Silver,
    Gold,
    Platinum,
    Diamond,
    Legend,
}

/// <summary>Type of event that produced an <see cref="ActivityFeedItem"/>.</summary>
public enum FeedItemType
{
    PromptCompleted,
    BadgeEarned,
    MilestoneAchieved,
    LevelUp,
    GoalCreated,
    Followed,
}
