// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Gamification;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Gamification;

/// <summary>
/// Edge-case pure unit tests for <see cref="LevelCalculator"/>. No DB, no DI.
/// Complements <see cref="LevelCalculatorTests"/> with boundary and tier-transition coverage.
/// </summary>
public sealed class LevelCalculatorEdgeCaseTests
{
    // -------------------------------------------------------------------------
    // XpRequiredForLevel — tier-boundary thresholds
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(25, 30000)]   // First Legend level: 50 × 25 × 24 = 30 000
    [InlineData(50, 122500)]  // 50 × 50 × 49 = 122 500
    public void XpRequiredForLevel_HighLevels_MatchFormula(int level, int expected)
    {
        Assert.Equal(expected, LevelCalculator.XpRequiredForLevel(level));
    }

    [Fact]
    public void XpRequiredForLevel_LevelZeroOrNegative_ReturnsZero()
    {
        // Anything ≤ 1 returns 0 — there is no "level 0" in the system.
        Assert.Equal(0, LevelCalculator.XpRequiredForLevel(0));
        Assert.Equal(0, LevelCalculator.XpRequiredForLevel(-5));
    }

    // -------------------------------------------------------------------------
    // ComputeLevel — level-up exactly at boundary XP
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(1000, 5)]    // XpRequiredForLevel(5)  = 50 × 5 × 4 = 1 000
    [InlineData(4500, 10)]   // XpRequiredForLevel(10) = 50 × 10 × 9 = 4 500
    [InlineData(10500, 15)]  // XpRequiredForLevel(15) = 50 × 15 × 14 = 10 500
    [InlineData(19000, 20)]  // XpRequiredForLevel(20) = 50 × 20 × 19 = 19 000
    [InlineData(29000, 24)]  // XpRequiredForLevel(24) = 50 × 24 × 23 = 27 600 → level 24 boundary at 27600
    [InlineData(30000, 25)]  // XpRequiredForLevel(25) = 50 × 25 × 24 = 30 000
    public void ComputeLevel_ExactBoundaryXp_ReturnsCorrectLevel(int xp, int expectedLevel)
    {
        Assert.Equal(expectedLevel, LevelCalculator.ComputeLevel(xp));
    }

    [Theory]
    [InlineData(999, 4)]     // One XP below level-5 boundary → still level 4
    [InlineData(4499, 9)]    // One XP below level-10 boundary → still level 9
    [InlineData(10499, 14)]  // One XP below level-15 boundary → still level 14
    [InlineData(29999, 24)]  // One XP below level-25 boundary → still level 24
    public void ComputeLevel_OneBelowBoundary_ReturnsPreviousLevel(int xp, int expectedLevel)
    {
        Assert.Equal(expectedLevel, LevelCalculator.ComputeLevel(xp));
    }

    // -------------------------------------------------------------------------
    // ComputeRankTier — all tier boundaries
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(4, RankTier.Bronze)]   // last Bronze level
    [InlineData(5, RankTier.Silver)]   // first Silver level
    [InlineData(9, RankTier.Silver)]   // last Silver level
    [InlineData(10, RankTier.Gold)]    // first Gold level
    [InlineData(14, RankTier.Gold)]    // last Gold level
    [InlineData(15, RankTier.Platinum)]// first Platinum level
    [InlineData(19, RankTier.Platinum)]// last Platinum level
    [InlineData(20, RankTier.Diamond)] // first Diamond level
    [InlineData(24, RankTier.Diamond)] // last Diamond level
    [InlineData(25, RankTier.Legend)]  // first Legend level
    [InlineData(1000, RankTier.Legend)]// very high level → still Legend
    public void ComputeRankTier_TierBoundaries_AreCorrect(int level, RankTier expected)
    {
        Assert.Equal(expected, LevelCalculator.ComputeRankTier(level));
    }

    [Fact]
    public void ComputeRankTier_Level1_IsBronze()
    {
        Assert.Equal(RankTier.Bronze, LevelCalculator.ComputeRankTier(1));
    }

    // -------------------------------------------------------------------------
    // XpIntoCurrentLevel — boundary and mid-level accuracy
    // -------------------------------------------------------------------------

    [Fact]
    public void XpIntoCurrentLevel_AtLevelOneBoundary_IsZero()
    {
        Assert.Equal(0, LevelCalculator.XpIntoCurrentLevel(0));
    }

    [Fact]
    public void XpIntoCurrentLevel_AtLevel5Boundary_IsZero()
    {
        // At exactly 1 000 XP the player just entered level 5 — 0 progress into it.
        Assert.Equal(0, LevelCalculator.XpIntoCurrentLevel(1000));
    }

    [Fact]
    public void XpIntoCurrentLevel_MidLevel5_IsCorrect()
    {
        // Level 5 spans 1 000–1 499 XP (XpForNextLevel = 50×6×5 − 50×5×4 = 1500−1000 = 500).
        // At 1 250 XP we are 250 into level 5.
        Assert.Equal(250, LevelCalculator.XpIntoCurrentLevel(1250));
    }

    // -------------------------------------------------------------------------
    // XpForNextLevel — level-width consistency
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(0, 100)]    // Level 1 → 2 width = 100
    [InlineData(100, 200)]  // Level 2 → 3 width = 200
    [InlineData(300, 300)]  // Level 3 → 4 width = 300
    [InlineData(1000, 500)] // Level 5 → 6 width = 50×6×5 − 50×5×4 = 1500−1000 = 500
    public void XpForNextLevel_ReturnsCorrectLevelWidth(int totalXp, int expectedWidth)
    {
        Assert.Equal(expectedWidth, LevelCalculator.XpForNextLevel(totalXp));
    }

    // -------------------------------------------------------------------------
    // Round-trip: XpRequiredForLevel ↔ ComputeLevel consistency
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    [InlineData(10)]
    [InlineData(15)]
    [InlineData(20)]
    [InlineData(25)]
    [InlineData(50)]
    public void ComputeLevel_AtExactThreshold_RoundTripsToLevel(int level)
    {
        var xp = LevelCalculator.XpRequiredForLevel(level);
        Assert.Equal(level, LevelCalculator.ComputeLevel(xp));
    }
}
