// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Prompts;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Prompts;

/// <summary>
/// Pure unit tests for the dependency-free <see cref="PromptMatcher"/>. No DB, no DI —
/// just deterministic inputs so the equipment / duration hard filters and the
/// intensity / goal / variety scoring are each isolated.
/// </summary>
public sealed class PromptMatcherTests
{
    private readonly PromptMatcher _matcher = new();

    [Fact]
    public void Match_excludes_activities_requiring_unavailable_equipment()
    {
        var bands = Act("bands-row", equipment: ["bands-light"]);

        var withoutEquipment = _matcher.Match(Ctx([bands]));
        Assert.Null(withoutEquipment);

        var withEquipment = _matcher.Match(Ctx([bands], equipment: ["bands-light"]));
        Assert.Same(bands, withEquipment);
    }

    [Fact]
    public void Match_includes_no_equipment_activity_even_with_empty_inventory()
    {
        var freeHands = Act("neck-rolls");
        Assert.Same(freeHands, _matcher.Match(Ctx([freeHands])));
    }

    [Fact]
    public void Match_requires_a_subset_of_all_required_tags()
    {
        var needsBoth = Act("combo", equipment: ["mat", "bands-light"]);

        // Only one of the two required tags present → excluded.
        Assert.Null(_matcher.Match(Ctx([needsBoth], equipment: ["mat"])));

        // Both present → included.
        Assert.Same(needsBoth, _matcher.Match(Ctx([needsBoth], equipment: ["mat", "bands-light"])));
    }

    [Fact]
    public void Match_excludes_activities_longer_than_the_gap()
    {
        var tenMinutes = Act("plank-series", durationSeconds: 600);

        Assert.Null(_matcher.Match(Ctx([tenMinutes], gapSeconds: 300)));
        Assert.Same(tenMinutes, _matcher.Match(Ctx([tenMinutes], gapSeconds: 600)));
    }

    [Fact]
    public void Match_prefers_exact_intensity_over_distant_intensity()
    {
        var exact = Act("a-medium", intensity: IntensityLevel.Medium);
        var distant = Act("b-high", intensity: IntensityLevel.High);
        var profile = new Profile { PreferredIntensity = IntensityLevel.Medium };

        var picked = _matcher.Match(Ctx([distant, exact], profile: profile));
        Assert.Same(exact, picked);
    }

    [Fact]
    public void Match_penalizes_high_intensity_for_a_sedentary_user()
    {
        // Preference is High, but the sedentary penalty drops High below the Medium
        // option even though Medium is one tier off the stated preference.
        var high = Act("a-high", intensity: IntensityLevel.High);
        var medium = Act("b-medium", intensity: IntensityLevel.Medium);
        var profile = new Profile
        {
            PreferredIntensity = IntensityLevel.High,
            FitnessBaseline = FitnessBaseline.Sedentary,
        };

        var picked = _matcher.Match(Ctx([high, medium], profile: profile));
        Assert.Same(medium, picked);
    }

    [Fact]
    public void Match_rewards_goal_aligned_body_area()
    {
        var aligned = Act("a-breath", bodyArea: BodyArea.Breath);
        var neutral = Act("b-core", bodyArea: BodyArea.Core);

        var picked = _matcher.Match(Ctx([neutral, aligned], goals: [GoalCategory.Breathing]));
        Assert.Same(aligned, picked);
    }

    [Fact]
    public void Match_de_prioritizes_recently_delivered_activities()
    {
        // "a-recent" sorts first by slug, so without the variety bonus it would win the
        // tie. Marking it recent lets the fresh "z-fresh" overtake it.
        var recent = Act("a-recent");
        var fresh = Act("z-fresh");

        var picked = _matcher.Match(Ctx([recent, fresh], recent: [recent.Id]));
        Assert.Same(fresh, picked);
    }

    [Fact]
    public void Match_tie_break_prefers_shorter_then_lower_slug()
    {
        var longer = Act("a-long", durationSeconds: 120);
        var shorter = Act("z-short", durationSeconds: 60);

        // Equal score → shorter duration wins despite the later slug.
        Assert.Same(shorter, _matcher.Match(Ctx([longer, shorter])));

        var first = Act("a-equal", durationSeconds: 60);
        var second = Act("b-equal", durationSeconds: 60);
        // Equal score AND duration → ordinal slug decides.
        Assert.Same(first, _matcher.Match(Ctx([second, first])));
    }

    [Fact]
    public void Match_leans_toward_registered_equipment_when_all_else_equal()
    {
        // Same body area, intensity, duration; the only difference is that one activity
        // uses gear the user owns. The equipment nudge should tip the selection.
        var freehand = Act("a-freehand");
        var withGear = Act("z-gear", equipment: ["bands-light"]);

        var picked = _matcher.Match(Ctx([freehand, withGear], equipment: ["bands-light"]));
        Assert.Same(withGear, picked);
    }

    [Fact]
    public void Match_pushes_a_policy_activity_while_behind_its_weekly_target()
    {
        // "a-bike" sorts first and also uses owned gear (+2). "z-treadmill" carries a
        // cadence policy; while the user is behind the weekly target it gets a strong
        // frequency bonus that overtakes the better slug.
        var bike = Act("a-bike", equipment: ["stationary-bike"]);
        var treadmill = Act("z-treadmill", equipment: ["under-desk-treadmill"]);
        var policies = new Dictionary<string, EquipmentPolicy>(StringComparer.Ordinal)
        {
            ["under-desk-treadmill"] = new(RecommendedWeeklySessions: 3, MinSessionMinutes: 0),
        };

        var behind = _matcher.Match(Ctx(
            [bike, treadmill],
            equipment: ["stationary-bike", "under-desk-treadmill"],
            policies: policies,
            deliveryCounts: new Dictionary<string, int>(StringComparer.Ordinal) { ["under-desk-treadmill"] = 0 }));
        Assert.Same(treadmill, behind);
    }

    [Fact]
    public void Match_drops_the_frequency_bonus_once_the_weekly_target_is_met()
    {
        // Same pair as above, but the weekly target is already satisfied, so the
        // frequency bonus disappears and the two equipment activities tie — the better
        // slug ("a-bike") then wins.
        var bike = Act("a-bike", equipment: ["stationary-bike"]);
        var treadmill = Act("z-treadmill", equipment: ["under-desk-treadmill"]);
        var policies = new Dictionary<string, EquipmentPolicy>(StringComparer.Ordinal)
        {
            ["under-desk-treadmill"] = new(RecommendedWeeklySessions: 3, MinSessionMinutes: 0),
        };

        var caughtUp = _matcher.Match(Ctx(
            [bike, treadmill],
            equipment: ["stationary-bike", "under-desk-treadmill"],
            policies: policies,
            deliveryCounts: new Dictionary<string, int>(StringComparer.Ordinal) { ["under-desk-treadmill"] = 3 }));
        Assert.Same(bike, caughtUp);
    }

    [Fact]
    public void Match_prefers_a_policy_min_session_length_when_the_gap_allows()
    {
        // The 30-minute walk meets the policy's min-session length and the 10-minute
        // stroll doesn't; in a long gap the walk should win despite being longer.
        var walk = Act("a-walk", durationSeconds: 1800, equipment: ["under-desk-treadmill"]);
        var stroll = Act("z-stroll", durationSeconds: 600, equipment: ["under-desk-treadmill"]);
        var policies = new Dictionary<string, EquipmentPolicy>(StringComparer.Ordinal)
        {
            ["under-desk-treadmill"] = new(RecommendedWeeklySessions: 3, MinSessionMinutes: 30),
        };

        var picked = _matcher.Match(Ctx(
            [stroll, walk],
            gapSeconds: 3600,
            equipment: ["under-desk-treadmill"],
            policies: policies));
        Assert.Same(walk, picked);
    }

    [Fact]
    public void Match_returns_null_when_nothing_fits()
    {
        Assert.Null(_matcher.Match(Ctx([])));

        var tooLong = Act("epic", durationSeconds: 6000);
        Assert.Null(_matcher.Match(Ctx([tooLong], gapSeconds: 60)));
    }

    private static Activity Act(
        string slug,
        int durationSeconds = 60,
        IntensityLevel intensity = IntensityLevel.Low,
        BodyArea bodyArea = BodyArea.Core,
        string[]? equipment = null) => new()
        {
            Slug = slug,
            Title = slug,
            Description = slug,
            BodyArea = bodyArea,
            Intensity = intensity,
            DurationSeconds = durationSeconds,
            EquipmentTags = equipment ?? [],
            AnimationProvider = "local",
            AnimationAssetId = slug,
        };

    private static PromptMatchContext Ctx(
        IReadOnlyList<Activity> catalog,
        int gapSeconds = 3600,
        Profile? profile = null,
        IReadOnlyCollection<GoalCategory>? goals = null,
        IEnumerable<string>? equipment = null,
        IEnumerable<Guid>? recent = null,
        IReadOnlyDictionary<string, EquipmentPolicy>? policies = null,
        IReadOnlyDictionary<string, int>? deliveryCounts = null) => new(
            gapSeconds,
            profile,
            goals ?? [],
            (equipment ?? []).ToHashSet(StringComparer.Ordinal),
            catalog,
            (recent ?? []).ToHashSet(),
            policies ?? new Dictionary<string, EquipmentPolicy>(StringComparer.Ordinal),
            deliveryCounts ?? new Dictionary<string, int>(StringComparer.Ordinal));
}
