// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Schedule.Gaps;

/// <summary>
/// Pure interval-reduction implementation of <see cref="IGapDetector"/>.
/// No DI, no I/O, no time provider — everything flows from the parameters.
/// </summary>
internal sealed class GapDetector : IGapDetector
{
    public IReadOnlyList<Gap> Detect(
        IReadOnlyList<BusyInterval> busyIntervals,
        DateTimeOffset from,
        DateTimeOffset to,
        IReadOnlyList<DateTimeOffset> recentPromptDeliveries,
        TimeZoneInfo userTimeZone,
        GapDetectionOptions options,
        DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(busyIntervals);
        ArgumentNullException.ThrowIfNull(recentPromptDeliveries);
        ArgumentNullException.ThrowIfNull(userTimeZone);
        ArgumentNullException.ThrowIfNull(options);

        var windowStart = from.ToUniversalTime();
        var windowEnd = to.ToUniversalTime();
        if (windowEnd <= windowStart)
        {
            return [];
        }

        var minSpan = TimeSpan.FromMinutes(options.MinGapMinutes);
        var maxSpan = TimeSpan.FromMinutes(options.MaxGapMinutes);
        var cooldown = TimeSpan.FromMinutes(options.PromptCooldownMinutes);
        var nowU = nowUtc.ToUniversalTime();

        var merged = MergeBusy(busyIntervals, windowStart, windowEnd);
        var raw = Complement(merged, windowStart, windowEnd);
        var afterNow = ClipByNow(raw, nowU);
        var allowed = AllowedHoursUtc(userTimeZone, options, windowStart, windowEnd);
        var withinHours = Intersect(afterNow, allowed);
        var blackouts = BlackoutsUtc(userTimeZone, options, windowStart, windowEnd);
        var afterBlackouts = Subtract(withinHours, blackouts);
        var afterCooldown = ApplyCooldown(afterBlackouts, recentPromptDeliveries, cooldown);

        var results = new List<Gap>(afterCooldown.Count);
        foreach (var iv in afterCooldown)
        {
            if (iv.End - iv.Start < minSpan)
            {
                continue;
            }
            var capEnd = iv.End - iv.Start > maxSpan ? iv.Start + maxSpan : iv.End;
            results.Add(new Gap(iv.Start, capEnd));
        }
        return results;
    }

    // -----------------------------------------------------------------
    // Step 1: clip + merge busy intervals.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> MergeBusy(
        IReadOnlyList<BusyInterval> busy,
        DateTimeOffset windowStart,
        DateTimeOffset windowEnd)
    {
        var clipped = new List<(DateTimeOffset Start, DateTimeOffset End)>(busy.Count);
        foreach (var b in busy)
        {
            var s = b.StartUtc.ToUniversalTime();
            var e = b.EndUtc.ToUniversalTime();
            if (e <= s)
            {
                continue;
            }
            // half-open overlap with [windowStart, windowEnd)
            if (e <= windowStart || s >= windowEnd)
            {
                continue;
            }
            clipped.Add((s < windowStart ? windowStart : s, e > windowEnd ? windowEnd : e));
        }
        clipped.Sort((a, b) => a.Start.CompareTo(b.Start));

        var merged = new List<(DateTimeOffset Start, DateTimeOffset End)>(clipped.Count);
        foreach (var iv in clipped)
        {
            if (merged.Count == 0)
            {
                merged.Add(iv);
                continue;
            }
            var last = merged[^1];
            // touching counts as merge so [9:00,10:00) + [10:00,11:00) => [9:00,11:00)
            if (iv.Start <= last.End)
            {
                merged[^1] = (last.Start, iv.End > last.End ? iv.End : last.End);
            }
            else
            {
                merged.Add(iv);
            }
        }
        return merged;
    }

    // -----------------------------------------------------------------
    // Step 2: complement → raw free intervals inside the window.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> Complement(
        List<(DateTimeOffset Start, DateTimeOffset End)> mergedBusy,
        DateTimeOffset windowStart,
        DateTimeOffset windowEnd)
    {
        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>(mergedBusy.Count + 1);
        var cursor = windowStart;
        foreach (var b in mergedBusy)
        {
            if (b.Start > cursor)
            {
                result.Add((cursor, b.Start));
            }
            if (b.End > cursor)
            {
                cursor = b.End;
            }
        }
        if (cursor < windowEnd)
        {
            result.Add((cursor, windowEnd));
        }
        return result;
    }

    // -----------------------------------------------------------------
    // Step 3: clip by now (no whole-interval rejection — past tail is just trimmed).
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> ClipByNow(
        List<(DateTimeOffset Start, DateTimeOffset End)> intervals,
        DateTimeOffset now)
    {
        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>(intervals.Count);
        foreach (var iv in intervals)
        {
            var start = iv.Start < now ? now : iv.Start;
            if (start < iv.End)
            {
                result.Add((start, iv.End));
            }
        }
        return result;
    }

    // -----------------------------------------------------------------
    // Step 4 (a): build the UTC allowed-hours windows for each local day
    // the query window touches. Each day produces one UTC interval, with
    // DST gaps shortening the day automatically because invalid local
    // moments are snapped forward to the next valid one.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> AllowedHoursUtc(
        TimeZoneInfo tz,
        GapDetectionOptions opts,
        DateTimeOffset windowStart,
        DateTimeOffset windowEnd)
    {
        var localFirst = TimeZoneInfo.ConvertTime(windowStart.UtcDateTime, tz).Date;
        var localLast = TimeZoneInfo.ConvertTime(windowEnd.UtcDateTime, tz).Date;

        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        for (var d = localFirst; d <= localLast; d = d.AddDays(1))
        {
            var beginLocal = d.AddHours(opts.EarliestHourLocal);
            // LatestHour == 24 means "end of day" so anchor to next-day midnight.
            var endLocal = opts.LatestHourLocal == 24 ? d.AddDays(1) : d.AddHours(opts.LatestHourLocal);
            var beginUtc = LocalToUtcSafe(beginLocal, tz);
            var endUtc = LocalToUtcSafe(endLocal, tz);
            if (endUtc > beginUtc)
            {
                result.Add((new DateTimeOffset(beginUtc, TimeSpan.Zero), new DateTimeOffset(endUtc, TimeSpan.Zero)));
            }
        }
        return result;
    }

    // -----------------------------------------------------------------
    // Step 4 (b): intersect input intervals with the allowed-hours windows.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> Intersect(
        List<(DateTimeOffset Start, DateTimeOffset End)> intervals,
        List<(DateTimeOffset Start, DateTimeOffset End)> allowed)
    {
        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        foreach (var iv in intervals)
        {
            foreach (var a in allowed)
            {
                var s = iv.Start > a.Start ? iv.Start : a.Start;
                var e = iv.End < a.End ? iv.End : a.End;
                if (e > s)
                {
                    result.Add((s, e));
                }
            }
        }
        result.Sort((a, b) => a.Start.CompareTo(b.Start));
        return result;
    }

    // -----------------------------------------------------------------
    // Step 5 (a): expand each configured blackout to UTC intervals per day.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> BlackoutsUtc(
        TimeZoneInfo tz,
        GapDetectionOptions opts,
        DateTimeOffset windowStart,
        DateTimeOffset windowEnd)
    {
        if (opts.BlackoutWindowsLocal.Count == 0)
        {
            return [];
        }
        var localFirst = TimeZoneInfo.ConvertTime(windowStart.UtcDateTime, tz).Date;
        var localLast = TimeZoneInfo.ConvertTime(windowEnd.UtcDateTime, tz).Date;

        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        for (var d = localFirst; d <= localLast; d = d.AddDays(1))
        {
            foreach (var b in opts.BlackoutWindowsLocal)
            {
                var beginLocal = d.AddHours(b.StartHour).AddMinutes(b.StartMinute);
                var endLocal = b.EndHour == 24
                    ? d.AddDays(1)
                    : d.AddHours(b.EndHour).AddMinutes(b.EndMinute);
                var beginUtc = LocalToUtcSafe(beginLocal, tz);
                var endUtc = LocalToUtcSafe(endLocal, tz);
                if (endUtc > beginUtc)
                {
                    result.Add((new DateTimeOffset(beginUtc, TimeSpan.Zero), new DateTimeOffset(endUtc, TimeSpan.Zero)));
                }
            }
        }
        return result;
    }

    // -----------------------------------------------------------------
    // Step 5 (b): subtract blackout UTC intervals from the surviving intervals.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> Subtract(
        List<(DateTimeOffset Start, DateTimeOffset End)> intervals,
        List<(DateTimeOffset Start, DateTimeOffset End)> subtract)
    {
        if (subtract.Count == 0)
        {
            return intervals;
        }
        var current = intervals;
        foreach (var s in subtract)
        {
            var next = new List<(DateTimeOffset Start, DateTimeOffset End)>(current.Count);
            foreach (var iv in current)
            {
                if (s.End <= iv.Start || s.Start >= iv.End)
                {
                    next.Add(iv);
                    continue;
                }
                if (s.Start > iv.Start)
                {
                    next.Add((iv.Start, s.Start));
                }
                if (s.End < iv.End)
                {
                    next.Add((s.End, iv.End));
                }
            }
            current = next;
        }
        return current;
    }

    // -----------------------------------------------------------------
    // Step 6: advance each interval start past any prompt-within-cooldown.
    // -----------------------------------------------------------------
    private static List<(DateTimeOffset Start, DateTimeOffset End)> ApplyCooldown(
        List<(DateTimeOffset Start, DateTimeOffset End)> intervals,
        IReadOnlyList<DateTimeOffset> recentPrompts,
        TimeSpan cooldown)
    {
        if (recentPrompts.Count == 0 || cooldown == TimeSpan.Zero)
        {
            return intervals;
        }
        var result = new List<(DateTimeOffset Start, DateTimeOffset End)>(intervals.Count);
        foreach (var iv in intervals)
        {
            // The blocking prompt is the latest one whose cooldown window still
            // covers any part of this interval. Anything older has expired;
            // anything after the interval doesn't apply here.
            DateTimeOffset? blocker = null;
            foreach (var t in recentPrompts)
            {
                var tu = t.ToUniversalTime();
                if (tu >= iv.End)
                {
                    continue;
                }
                if (tu + cooldown <= iv.Start)
                {
                    continue;
                }
                if (blocker is null || tu > blocker.Value)
                {
                    blocker = tu;
                }
            }
            if (blocker is null)
            {
                result.Add(iv);
                continue;
            }
            var earliest = blocker.Value + cooldown;
            if (earliest >= iv.End)
            {
                continue;
            }
            result.Add((earliest > iv.Start ? earliest : iv.Start, iv.End));
        }
        return result;
    }

    // -----------------------------------------------------------------
    // DST-safe local-to-UTC conversion.
    // Spring-forward "invalid" local times are snapped forward to the next
    // valid moment so the resulting UTC window simply starts a bit later
    // (matching what a real-world user perceives — the missing hour is gone,
    // not somehow recovered). Ambiguous local times during fall-back are
    // resolved by ConvertTimeToUtc deterministically.
    // -----------------------------------------------------------------
    private static DateTime LocalToUtcSafe(DateTime localUnspecified, TimeZoneInfo tz)
    {
        var local = localUnspecified.Kind == DateTimeKind.Unspecified
            ? localUnspecified
            : DateTime.SpecifyKind(localUnspecified, DateTimeKind.Unspecified);
        if (tz.IsInvalidTime(local))
        {
            // Snap forward in 1-minute increments until valid. DST gaps are at
            // most a few hours; the bounded loop is a safety net.
            var snapped = local;
            for (var i = 0; i < 24 * 60 && tz.IsInvalidTime(snapped); i++)
            {
                snapped = snapped.AddMinutes(1);
            }
            local = snapped;
        }
        return TimeZoneInfo.ConvertTimeToUtc(local, tz);
    }
}
