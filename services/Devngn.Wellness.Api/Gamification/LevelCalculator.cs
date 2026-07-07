// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Gamification;

/// <summary>
/// Pure level-curve and rank-tier calculations. Separated from EF for easy unit testing.
/// <para>
/// Level curve: <c>XpRequired(level) = 50 × level × (level − 1)</c>
/// <list type="bullet">
///   <item>Level 1: 0 XP</item>
///   <item>Level 2: 100 XP</item>
///   <item>Level 3: 300 XP</item>
///   <item>Level 4: 600 XP</item>
///   <item>Level 5: 1 000 XP</item>
///   <item>Level 10: 4 500 XP</item>
/// </list>
/// </para>
/// </summary>
public static class LevelCalculator
{
    /// <summary>
    /// Total XP a player needs to reach <paramref name="level"/>.
    /// Level 1 requires 0 XP (everyone starts at level 1).
    /// </summary>
    public static int XpRequiredForLevel(int level) =>
        level <= 1 ? 0 : 50 * level * (level - 1);

    /// <summary>Derives the current level from <paramref name="totalXp"/>.</summary>
    public static int ComputeLevel(int totalXp)
    {
        var level = 1;
        while (XpRequiredForLevel(level + 1) <= totalXp)
        {
            level++;
        }
        return level;
    }

    /// <summary>
    /// Returns the XP already accumulated inside the current level band
    /// (i.e. how far the player is into this level).
    /// </summary>
    public static int XpIntoCurrentLevel(int totalXp)
    {
        var level = ComputeLevel(totalXp);
        return totalXp - XpRequiredForLevel(level);
    }

    /// <summary>Total XP distance to the next level boundary.</summary>
    public static int XpForNextLevel(int totalXp)
    {
        var level = ComputeLevel(totalXp);
        return XpRequiredForLevel(level + 1) - XpRequiredForLevel(level);
    }

    /// <summary>
    /// Rank tier derived from the player's level.
    /// <list type="table">
    ///   <listheader><term>Level</term><description>Rank</description></listheader>
    ///   <item><term>1–4</term><description>Bronze</description></item>
    ///   <item><term>5–9</term><description>Silver</description></item>
    ///   <item><term>10–14</term><description>Gold</description></item>
    ///   <item><term>15–19</term><description>Platinum</description></item>
    ///   <item><term>20–24</term><description>Diamond</description></item>
    ///   <item><term>25+</term><description>Legend</description></item>
    /// </list>
    /// </summary>
    public static RankTier ComputeRankTier(int level) => level switch
    {
        <= 4 => RankTier.Bronze,
        <= 9 => RankTier.Silver,
        <= 14 => RankTier.Gold,
        <= 19 => RankTier.Platinum,
        <= 24 => RankTier.Diamond,
        _ => RankTier.Legend,
    };
}
