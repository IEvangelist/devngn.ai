// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Schedule.Gaps;

/// <summary>
/// A single eligible prompt opportunity. All times are UTC. The engine never
/// returns ineligible intervals — they're folded into the pipeline rather than
/// surfaced — so consumers can iterate this list and deliver every entry.
/// </summary>
public sealed record Gap(DateTimeOffset StartUtc, DateTimeOffset EndUtc)
{
    /// <summary>
    /// Presentation-only minute count, floored. Eligibility upstream is computed
    /// against the raw <see cref="TimeSpan"/> (ticks) so a 4-minute-59-second gap
    /// isn't accidentally accepted when <c>MinGapMinutes = 5</c>.
    /// </summary>
    public int DurationMinutes => (int)Math.Floor((EndUtc - StartUtc).TotalMinutes);
}

/// <summary>
/// A merged busy interval the engine treats as opaque. Sourced from
/// <c>ScheduleEvent</c> rows in the API layer; the engine doesn't reference EF.
/// </summary>
public readonly record struct BusyInterval(DateTimeOffset StartUtc, DateTimeOffset EndUtc);

/// <summary>
/// Pure, dependency-free gap detector. The implementation has no I/O, no DI,
/// and accepts <see cref="GapDetectionOptions"/> + <c>nowUtc</c> as parameters
/// so unit tests are deterministic.
/// </summary>
/// <remarks>
/// Pipeline (interval reduction — never whole-gap rejection):
/// <list type="number">
///   <item>Clip + merge busy intervals to the window.</item>
///   <item>Compute complementary free intervals.</item>
///   <item>Clip each interval forward to <c>nowUtc</c>.</item>
///   <item>Intersect with the per-day allowed-hours UTC windows.</item>
///   <item>Subtract per-day blackout UTC windows.</item>
///   <item>Advance each interval's start past any prompt-within-cooldown.</item>
///   <item>Drop intervals below <c>MinGapMinutes</c>, cap survivors to <c>MaxGapMinutes</c>.</item>
/// </list>
/// </remarks>
public interface IGapDetector
{
    /// <summary>
    /// Detect eligible prompt opportunities in the half-open UTC window
    /// <c>[from, to)</c>. Returns an empty list when no opportunity survives
    /// the pipeline. The result is ordered by start time and never overlaps.
    /// </summary>
    IReadOnlyList<Gap> Detect(
        IReadOnlyList<BusyInterval> busyIntervals,
        DateTimeOffset from,
        DateTimeOffset to,
        IReadOnlyList<DateTimeOffset> recentPromptDeliveries,
        TimeZoneInfo userTimeZone,
        GapDetectionOptions options,
        DateTimeOffset nowUtc);
}
