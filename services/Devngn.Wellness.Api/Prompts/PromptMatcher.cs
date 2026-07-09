// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Collections.Frozen;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Deterministic, pure activity matcher. Hard filters remove anything the user can't
/// physically do (missing equipment) or that won't fit the gap; survivors are scored
/// by how well they match the profile, goals, and recent variety, then ordered so the
/// selection is stable and diffable across calls.
/// </summary>
internal sealed class PromptMatcher : IPromptMatcher
{
    // Which body areas each goal category "rewards". Overlap with an activity's body
    // area is a soft signal (+GoalAlignmentBonus), never a hard filter, so a user with
    // goals still gets a sensible suggestion when nothing aligns perfectly.
    private static readonly FrozenDictionary<GoalCategory, FrozenSet<BodyArea>> GoalAffinity =
        new Dictionary<GoalCategory, FrozenSet<BodyArea>>
        {
            [GoalCategory.Mobility] = FrozenSet.ToFrozenSet(
            [
                BodyArea.Full, BodyArea.Neck, BodyArea.Back,
                BodyArea.Wrists, BodyArea.Hips, BodyArea.Ankles,
            ]),
            [GoalCategory.Strength] = FrozenSet.ToFrozenSet(
            [
                BodyArea.Upper, BodyArea.Lower, BodyArea.Core, BodyArea.Full,
            ]),
            [GoalCategory.Breathing] = FrozenSet.ToFrozenSet([BodyArea.Breath]),
            [GoalCategory.Posture] = FrozenSet.ToFrozenSet(
            [
                BodyArea.Posture, BodyArea.Back, BodyArea.Neck,
            ]),
            [GoalCategory.CardioLight] = FrozenSet.ToFrozenSet([BodyArea.Full, BodyArea.Lower]),
        }.ToFrozenDictionary();

    private const int IntensityExactBonus = 4;
    private const int IntensityNearBonus = 2;
    private const int SedentaryHighPenalty = 3;
    private const int GoalAlignmentBonus = 3;
    private const int VarietyBonus = 1;

    // Lean on registered gear "more often than not": a soft nudge toward activities that
    // actually use equipment the user owns, without overpowering intensity/goal fit.
    private const int EquipmentUseBonus = 2;

    // Cadence policy (e.g. under-desk treadmill 3x/week): while the user is behind on the
    // weekly target, push policy'd activities hard so they reliably land across the week.
    private const int PolicyFrequencyBonus = 6;

    // When a gap is long enough, prefer a policy'd activity that meets its minimum session
    // length (e.g. a 30-minute treadmill walk over a 10-minute stroll).
    private const int PolicyMinSessionBonus = 3;

    public Activity? Match(PromptMatchContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        return context.Catalog
            .Where(a => a.DurationSeconds <= context.GapDurationSeconds)
            .Where(a => IsEquipmentSubset(a.EquipmentTags, context.EquipmentTags))
            .Select(a => (Activity: a, Score: Score(a, context)))
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Activity.DurationSeconds)
            .ThenBy(x => x.Activity.Slug, StringComparer.Ordinal)
            .Select(x => x.Activity)
            .FirstOrDefault();
    }

    private static int Score(Activity activity, PromptMatchContext context)
    {
        var score = 0;

        if (context.Profile is { } profile)
        {
            var diff = Math.Abs((int)activity.Intensity - (int)profile.PreferredIntensity);
            score += diff switch
            {
                0 => IntensityExactBonus,
                1 => IntensityNearBonus,
                _ => 0,
            };

            // A sedentary user shouldn't be nudged into a high-intensity burst unless
            // it's the only thing that fits — strong penalty, not a hard exclusion.
            if (profile.FitnessBaseline == FitnessBaseline.Sedentary && activity.Intensity == IntensityLevel.High)
            {
                score -= SedentaryHighPenalty;
            }
        }

        if (AlignsWithGoals(activity.BodyArea, context.Goals))
        {
            score += GoalAlignmentBonus;
        }

        if (!context.RecentActivityIds.Contains(activity.Id))
        {
            score += VarietyBonus;
        }

        score += EquipmentScore(activity, context);

        return score;
    }

    /// <summary>
    /// Rewards activities that use the user's registered equipment, and applies cadence
    /// policy on top: a strong bonus while the user is behind a weekly target, plus a
    /// preference for meeting a policy's minimum session length when the gap allows.
    /// Returns 0 for no-equipment activities so simple stretches stay first-class.
    /// </summary>
    private static int EquipmentScore(Activity activity, PromptMatchContext context)
    {
        if (activity.EquipmentTags.Length == 0 ||
            !IsEquipmentSubset(activity.EquipmentTags, context.EquipmentTags))
        {
            return 0;
        }

        var score = EquipmentUseBonus;

        foreach (var tag in activity.EquipmentTags)
        {
            if (!context.EquipmentPolicies.TryGetValue(tag, out var policy))
            {
                continue;
            }

            var deliveredThisWeek = context.EquipmentDeliveryCountsLast7Days.GetValueOrDefault(tag);
            if (deliveredThisWeek < policy.RecommendedWeeklySessions)
            {
                score += PolicyFrequencyBonus;
            }

            if (policy.MinSessionMinutes > 0 && activity.DurationSeconds >= policy.MinSessionMinutes * 60)
            {
                score += PolicyMinSessionBonus;
            }
        }

        return score;
    }

    private static bool AlignsWithGoals(BodyArea area, IReadOnlyCollection<GoalCategory> goals)
    {
        foreach (var goal in goals)
        {
            if (GoalAffinity.TryGetValue(goal, out var areas) && areas.Contains(area))
            {
                return true;
            }
        }
        return false;
    }

    private static bool IsEquipmentSubset(IReadOnlyList<string> required, IReadOnlySet<string> available)
    {
        for (var i = 0; i < required.Count; i++)
        {
            if (!available.Contains(required[i]))
            {
                return false;
            }
        }
        return true;
    }
}
