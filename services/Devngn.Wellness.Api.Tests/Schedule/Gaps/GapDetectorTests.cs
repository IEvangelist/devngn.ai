// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.Gaps;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule.Gaps;

/// <summary>
/// Pure unit tests against the dependency-free <see cref="GapDetector"/>. No DB, no DI,
/// no factory — just direct invocation with deterministic inputs and a frozen "now".
/// </summary>
public sealed class GapDetectorTests
{
    private readonly GapDetector _det = new();
    private static readonly TimeZoneInfo UtcZone = TimeZoneInfo.Utc;
    private static readonly DateTimeOffset DistantPast = new(2020, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>Wide-open options so individual tests can focus on one pipeline stage.</summary>
    private static GapDetectionOptions WideOpenOptions() => new()
    {
        MinGapMinutes = 5,
        MaxGapMinutes = 600, // intentionally large so most tests don't hit the cap
        PromptCooldownMinutes = 0,
        EarliestHourLocal = 0,
        LatestHourLocal = 24,
    };

    private static DateTimeOffset Utc(int year, int month, int day, int hour, int minute = 0) =>
        new(year, month, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public void Returns_empty_when_to_is_not_after_from()
    {
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 10), [], UtcZone, WideOpenOptions(), DistantPast);
        Assert.Empty(res);
    }

    [Fact]
    public void Empty_busy_list_emits_single_gap_in_window()
    {
        var opts = WideOpenOptions();
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), [], UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 11), gap.EndUtc);
        Assert.Equal(60, gap.DurationMinutes);
    }

    [Fact]
    public void Single_busy_in_middle_splits_window_into_two_gaps()
    {
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 11), Utc(2026, 6, 1, 12)) };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 13), [], UtcZone, WideOpenOptions(), DistantPast);
        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 10), res[0].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 11), res[0].EndUtc);
        Assert.Equal(Utc(2026, 6, 1, 12), res[1].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 13), res[1].EndUtc);
    }

    [Fact]
    public void Overlapping_busy_intervals_from_different_sources_are_merged()
    {
        // Two busy events 10:00-11:00 and 10:30-11:30 should merge to 10:00-11:30.
        var busy = new[]
        {
            new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)),
            new BusyInterval(Utc(2026, 6, 1, 10, 30), Utc(2026, 6, 1, 11, 30)),
        };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 13), [], UtcZone, WideOpenOptions(), DistantPast);
        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 9), res[0].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 10), res[0].EndUtc);
        Assert.Equal(Utc(2026, 6, 1, 11, 30), res[1].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 13), res[1].EndUtc);
    }

    [Fact]
    public void Touching_busy_intervals_are_merged()
    {
        var busy = new[]
        {
            new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)),
            new BusyInterval(Utc(2026, 6, 1, 11), Utc(2026, 6, 1, 12)),
        };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 13), [], UtcZone, WideOpenOptions(), DistantPast);
        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 12), res[1].StartUtc);
    }

    [Fact]
    public void Events_outside_window_are_ignored()
    {
        var busy = new[]
        {
            new BusyInterval(Utc(2026, 6, 1, 5), Utc(2026, 6, 1, 6)),
            new BusyInterval(Utc(2026, 6, 1, 20), Utc(2026, 6, 1, 21)),
        };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), [], UtcZone, WideOpenOptions(), DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 11), gap.EndUtc);
    }

    [Fact]
    public void Event_partially_outside_window_is_clipped()
    {
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 11)) };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 13), [], UtcZone, WideOpenOptions(), DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 11), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 13), gap.EndUtc);
    }

    [Fact]
    public void Gap_shorter_than_MinGapMinutes_is_dropped()
    {
        var opts = WideOpenOptions();
        opts.MinGapMinutes = 5;
        // 4-minute gap is below the threshold of 5min and must not appear in the result.
        var busy = new[]
        {
            new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)),
            new BusyInterval(Utc(2026, 6, 1, 11, 4), Utc(2026, 6, 1, 12)),
        };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 12), [], UtcZone, opts, DistantPast);
        Assert.Empty(res);
    }

    [Fact]
    public void Long_gap_is_capped_to_MaxGapMinutes_from_start()
    {
        var opts = WideOpenOptions();
        opts.MaxGapMinutes = 30;
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 14), [], UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 10, 30), gap.EndUtc);
        Assert.Equal(30, gap.DurationMinutes);
    }

    [Fact]
    public void Allowed_hours_clip_gap_not_reject_it()
    {
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 17;
        // Raw gap spans 06:00–20:00 UTC; expect clip to 09:00–17:00 UTC then cap to 600m end.
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 6), Utc(2026, 6, 1, 20), [], UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 9), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 17), gap.EndUtc);
    }

    [Fact]
    public void Blackout_subtracts_middle_creating_two_sub_intervals()
    {
        var opts = WideOpenOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow { StartHour = 12, EndHour = 13 });
        // 10:00–15:00 UTC with lunch blackout 12-13 → two gaps: 10-12 and 13-15.
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 15), [], UtcZone, opts, DistantPast);
        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 10), res[0].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 12), res[0].EndUtc);
        Assert.Equal(Utc(2026, 6, 1, 13), res[1].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 15), res[1].EndUtc);
    }

    [Fact]
    public void Multiple_blackouts_subtract_sequentially()
    {
        var opts = WideOpenOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow { StartHour = 11, EndHour = 12 });
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow { StartHour = 13, EndHour = 14 });
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 15), [], UtcZone, opts, DistantPast);
        Assert.Equal(3, res.Count);
        Assert.Equal((Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)), (res[0].StartUtc, res[0].EndUtc));
        Assert.Equal((Utc(2026, 6, 1, 12), Utc(2026, 6, 1, 13)), (res[1].StartUtc, res[1].EndUtc));
        Assert.Equal((Utc(2026, 6, 1, 14), Utc(2026, 6, 1, 15)), (res[2].StartUtc, res[2].EndUtc));
    }

    [Fact]
    public void NowUtc_in_middle_of_gap_trims_the_start_does_not_reject()
    {
        var now = Utc(2026, 6, 1, 10, 30);
        // Whole window 10–11 → after now-clip should be 10:30–11.
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), [], UtcZone, WideOpenOptions(), now);
        var gap = Assert.Single(res);
        Assert.Equal(now, gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 11), gap.EndUtc);
    }

    [Fact]
    public void NowUtc_after_window_emits_nothing()
    {
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), [], UtcZone, WideOpenOptions(),
            Utc(2026, 6, 2, 10));
        Assert.Empty(res);
    }

    [Fact]
    public void Cooldown_recent_prompt_within_window_trims_start()
    {
        var opts = WideOpenOptions();
        opts.PromptCooldownMinutes = 30;
        // Last prompt 09:50, cooldown 30m → earliest next is 10:20. Gap 10:00-11:00 → 10:20-11:00.
        var recent = new[] { Utc(2026, 6, 1, 9, 50) };
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), recent, UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10, 20), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 11), gap.EndUtc);
    }

    [Fact]
    public void Cooldown_recent_prompt_before_cooldown_window_has_no_effect()
    {
        var opts = WideOpenOptions();
        opts.PromptCooldownMinutes = 30;
        var recent = new[] { Utc(2026, 6, 1, 9, 0) };
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), recent, UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10), gap.StartUtc);
    }

    [Fact]
    public void Cooldown_recent_prompt_blocks_entire_gap_returns_empty()
    {
        var opts = WideOpenOptions();
        opts.PromptCooldownMinutes = 30;
        // Last prompt 10:55, gap 10:00-11:00 → earliest is 11:25, beyond gap.End.
        var recent = new[] { Utc(2026, 6, 1, 10, 55) };
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), recent, UtcZone, opts, DistantPast);
        Assert.Empty(res);
    }

    [Fact]
    public void Cooldown_uses_latest_blocking_prompt_when_multiple()
    {
        var opts = WideOpenOptions();
        opts.PromptCooldownMinutes = 30;
        // Two recent prompts at 09:20 and 09:50; cooldown 30m. Both predate gap 10:00-11:00,
        // but the *later* one (09:50) is the binding constraint → earliest is 10:20.
        var recent = new[] { Utc(2026, 6, 1, 9, 20), Utc(2026, 6, 1, 9, 50) };
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11), recent, UtcZone, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 10, 20), gap.StartUtc);
    }

    [Fact]
    public void Multi_day_window_emits_a_gap_per_local_day()
    {
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 10;
        opts.MaxGapMinutes = 60;
        // 2 days, no events, allowed window 09–10 → expect 2 gaps.
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 0), Utc(2026, 6, 3, 0), [], UtcZone, opts, DistantPast);
        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 9), res[0].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 10), res[0].EndUtc);
        Assert.Equal(Utc(2026, 6, 2, 9), res[1].StartUtc);
        Assert.Equal(Utc(2026, 6, 2, 10), res[1].EndUtc);
    }

    [Fact]
    public void All_day_busy_emits_no_gap()
    {
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 17)) };
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 17;
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 17), [], UtcZone, opts, DistantPast);
        Assert.Empty(res);
    }

    [Fact]
    public void Local_business_hours_full_eight_hour_window_emitted_when_max_is_larger()
    {
        var ny = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 17;
        opts.MaxGapMinutes = 600; // 10h cap > 8h business day
        var res = _det.Detect(
            [], Utc(2026, 6, 15, 0), Utc(2026, 6, 16, 0), [], ny, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 15, 13), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 15, 21), gap.EndUtc);
        Assert.Equal(480, gap.DurationMinutes);
    }

    [Fact]
    public void Dst_spring_forward_invalid_local_time_is_snapped_forward()
    {
        // US spring forward 2026: March 8 at 02:00 NY local → jumps to 03:00 EDT.
        // Local times 02:00–02:59 do not exist that day.
        var ny = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 1; // 01:00 NY EST = 06:00 UTC
        opts.LatestHourLocal = 4;   // 04:00 NY EDT = 08:00 UTC
        opts.MaxGapMinutes = 600;
        // Window covers the whole DST day in UTC.
        var res = _det.Detect(
            [], Utc(2026, 3, 8, 5), Utc(2026, 3, 8, 10), [], ny, opts, DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 3, 8, 6), gap.StartUtc);
        Assert.Equal(Utc(2026, 3, 8, 8), gap.EndUtc);
        // 3 local hours but 2 UTC hours because 02:00–02:59 vanished. The DST gap
        // shrinks the day automatically — no special-case needed in the engine.
        Assert.Equal(120, gap.DurationMinutes);
    }

    [Fact]
    public void Dst_spring_forward_with_earliest_inside_gap_snaps_to_next_valid_moment()
    {
        var ny = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 2; // 02:00 NY on 2026-03-08 is INVALID
        opts.LatestHourLocal = 5;
        opts.MaxGapMinutes = 600;
        var res = _det.Detect(
            [], Utc(2026, 3, 8, 6), Utc(2026, 3, 8, 12), [], ny, opts, DistantPast);
        var gap = Assert.Single(res);
        // 02:00 NY snaps forward to 03:00 NY EDT = 07:00 UTC.
        Assert.Equal(Utc(2026, 3, 8, 7), gap.StartUtc);
        // 05:00 NY EDT = 09:00 UTC.
        Assert.Equal(Utc(2026, 3, 8, 9), gap.EndUtc);
    }

    [Fact]
    public void Dst_fall_back_ambiguous_local_time_is_resolved_deterministically()
    {
        // US fall back 2026: November 1 at 02:00 NY EDT → 01:00 NY EST. Local 01:00-01:59
        // appears twice that day. ConvertTimeToUtc picks the standard-time offset → 06:00Z
        // for "01:00 NY" rather than 05:00Z. The engine treats this deterministically.
        var ny = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 1;
        opts.LatestHourLocal = 5;
        opts.MaxGapMinutes = 600;
        var res = _det.Detect(
            [], Utc(2026, 11, 1, 4), Utc(2026, 11, 1, 12), [], ny, opts, DistantPast);
        var gap = Assert.Single(res);
        // 01:00 NY (ambiguous) → ConvertTimeToUtc resolves to standard (EST -05:00) = 06:00 UTC.
        Assert.Equal(Utc(2026, 11, 1, 6), gap.StartUtc);
        // 05:00 NY EST = 10:00 UTC.
        Assert.Equal(Utc(2026, 11, 1, 10), gap.EndUtc);
    }

    [Fact]
    public void Combined_busy_blackout_cooldown_and_now_all_apply()
    {
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 17;
        opts.MinGapMinutes = 10;
        opts.MaxGapMinutes = 60;
        opts.PromptCooldownMinutes = 30;
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow { StartHour = 12, EndHour = 13 });

        // Window 09–17 UTC; one meeting 10–11; a recent prompt at 09:45 (UTC=local since tz=UTC).
        // Expected raw free intervals: 09–10, 11–12 (blackout subtract), 13–17 (capped to 60m).
        // Then:
        //   09–10:   cooldown clips start to 10:15 → end up empty (start >= end).
        //   11–12:   no cooldown effect, no clip → emit 11–12 capped to 60m.
        //   13–17:   capped at 60m → 13–14.
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)) };
        var recent = new[] { Utc(2026, 6, 1, 9, 45) };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 17), recent, UtcZone, opts, DistantPast);

        Assert.Equal(2, res.Count);
        Assert.Equal(Utc(2026, 6, 1, 11), res[0].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 12), res[0].EndUtc);
        Assert.Equal(Utc(2026, 6, 1, 13), res[1].StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 14), res[1].EndUtc);
    }

    [Fact]
    public void Zero_length_busy_event_is_ignored()
    {
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 10)) };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 12), [], UtcZone, WideOpenOptions(), DistantPast);
        var gap = Assert.Single(res);
        Assert.Equal(Utc(2026, 6, 1, 9), gap.StartUtc);
        Assert.Equal(Utc(2026, 6, 1, 12), gap.EndUtc);
    }

    [Fact]
    public void Returned_gaps_are_sorted_by_start_time()
    {
        // Two days with one allowed window each, out of input order? Engine guarantees sorted.
        var opts = WideOpenOptions();
        opts.EarliestHourLocal = 9;
        opts.LatestHourLocal = 10;
        opts.MaxGapMinutes = 60;
        var res = _det.Detect(
            [], Utc(2026, 6, 1, 0), Utc(2026, 6, 3, 0), [], UtcZone, opts, DistantPast);
        for (var i = 1; i < res.Count; i++)
        {
            Assert.True(res[i - 1].StartUtc < res[i].StartUtc);
        }
    }

    [Fact]
    public void Past_busy_does_not_resurrect_gap_after_now()
    {
        // The window is fully in the past relative to "now".
        var busy = new[] { new BusyInterval(Utc(2026, 6, 1, 10), Utc(2026, 6, 1, 11)) };
        var res = _det.Detect(
            busy, Utc(2026, 6, 1, 9), Utc(2026, 6, 1, 13), [], UtcZone, WideOpenOptions(),
            Utc(2026, 6, 2, 0));
        Assert.Empty(res);
    }
}
