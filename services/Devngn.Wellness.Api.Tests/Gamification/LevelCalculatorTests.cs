// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Gamification;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Gamification;

/// <summary>
/// Pure unit tests for <see cref="LevelCalculator"/>. No DB, no DI — fully deterministic.
/// </summary>
public sealed class LevelCalculatorTests
{
    // -------------------------------------------------------------------------
    // XpRequiredForLevel
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 100)]
    [InlineData(3, 300)]
    [InlineData(4, 600)]
    [InlineData(5, 1000)]
    [InlineData(10, 4500)]
    [InlineData(20, 19000)]
    public void XpRequiredForLevel_MatchesCurve(int level, int expected)
    {
        Assert.Equal(expected, LevelCalculator.XpRequiredForLevel(level));
    }

    [Fact]
    public void XpRequiredForLevel_LevelOne_IsZero()
    {
        Assert.Equal(0, LevelCalculator.XpRequiredForLevel(1));
    }

    // -------------------------------------------------------------------------
    // ComputeLevel
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(0, 1)]
    [InlineData(99, 1)]
    [InlineData(100, 2)]
    [InlineData(299, 2)]
    [InlineData(300, 3)]
    [InlineData(4499, 9)]
    [InlineData(4500, 10)]
    [InlineData(18999, 19)]
    [InlineData(19000, 20)]
    public void ComputeLevel_MapsXpToCorrectLevel(int xp, int expectedLevel)
    {
        Assert.Equal(expectedLevel, LevelCalculator.ComputeLevel(xp));
    }

    // -------------------------------------------------------------------------
    // XpIntoCurrentLevel
    // -------------------------------------------------------------------------

    [Fact]
    public void XpIntoCurrentLevel_AtLevelBoundary_IsZero()
    {
        // At exactly level-2 threshold (100 XP), progress into level 2 is 0.
        Assert.Equal(0, LevelCalculator.XpIntoCurrentLevel(100));
    }

    [Fact]
    public void XpIntoCurrentLevel_MidLevel_IsCorrect()
    {
        // Level 2 spans 100–299; at 150 XP we are 50 XP into the level.
        Assert.Equal(50, LevelCalculator.XpIntoCurrentLevel(150));
    }

    // -------------------------------------------------------------------------
    // XpForNextLevel
    // -------------------------------------------------------------------------

    [Fact]
    public void XpForNextLevel_LevelOne_Is100()
    {
        // Level 1 → 2 requires 100 XP total; distance is 100.
        Assert.Equal(100, LevelCalculator.XpForNextLevel(0));
    }

    [Fact]
    public void XpForNextLevel_LevelTwo_Is200()
    {
        // Level 2 → 3 requires 300 − 100 = 200 XP of progress.
        Assert.Equal(200, LevelCalculator.XpForNextLevel(100));
    }

    // -------------------------------------------------------------------------
    // ComputeRankTier
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(1, RankTier.Bronze)]
    [InlineData(4, RankTier.Bronze)]
    [InlineData(5, RankTier.Silver)]
    [InlineData(9, RankTier.Silver)]
    [InlineData(10, RankTier.Gold)]
    [InlineData(14, RankTier.Gold)]
    [InlineData(15, RankTier.Platinum)]
    [InlineData(19, RankTier.Platinum)]
    [InlineData(20, RankTier.Diamond)]
    [InlineData(24, RankTier.Diamond)]
    [InlineData(25, RankTier.Legend)]
    [InlineData(100, RankTier.Legend)]
    public void ComputeRankTier_MapsLevelToCorrectTier(int level, RankTier expected)
    {
        Assert.Equal(expected, LevelCalculator.ComputeRankTier(level));
    }

    // -------------------------------------------------------------------------
    // Streak / XP monotonicity invariants
    // -------------------------------------------------------------------------

    [Fact]
    public void XpRequiredForLevel_IsMonotonicallyIncreasing()
    {
        for (var level = 1; level < 50; level++)
        {
            Assert.True(
                LevelCalculator.XpRequiredForLevel(level + 1) > LevelCalculator.XpRequiredForLevel(level),
                $"XP required for level {level + 1} should be greater than level {level}.");
        }
    }

    [Fact]
    public void ComputeLevel_IsConsistentWithXpRequired()
    {
        for (var level = 1; level <= 30; level++)
        {
            var xp = LevelCalculator.XpRequiredForLevel(level);
            Assert.Equal(level, LevelCalculator.ComputeLevel(xp));

            // One XP below the next boundary should still be current level.
            if (level > 1)
            {
                Assert.Equal(level, LevelCalculator.ComputeLevel(xp + LevelCalculator.XpForNextLevel(xp) - 1));
            }
        }
    }
}
