// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Schedule.Gaps;

/// <summary>
/// Bound from the <c>Gaps</c> configuration section. Cross-field validation
/// (Earliest &lt; Latest, Max &gt;= Min, blackout start &lt; end) lives in
/// <see cref="GapDetectionOptionsValidator"/> because data annotations cover
/// only single-field constraints.
/// </summary>
public sealed class GapDetectionOptions
{
    public const string SectionName = "Gaps";

    /// <summary>Minimum free-time length, in minutes, that we'll consider an opportunity.</summary>
    [Range(1, 600)]
    public int MinGapMinutes { get; set; } = 5;

    /// <summary>
    /// Maximum length of a returned opportunity. A 4-hour open afternoon is not
    /// a single "wellness break" — we cap each emitted opportunity so the caller
    /// gets a deliverable window, not a calendar gap.
    /// </summary>
    [Range(1, 600)]
    public int MaxGapMinutes { get; set; } = 60;

    /// <summary>
    /// Minimum spacing between consecutive prompts. The engine clips each
    /// candidate's start forward by this amount past the most recent prompt
    /// rather than rejecting the entire interval — see <see cref="IGapDetector"/>.
    /// </summary>
    [Range(0, 1440)]
    public int PromptCooldownMinutes { get; set; } = 30;

    /// <summary>Earliest local hour at which an opportunity may start. Defaults to 09:00.</summary>
    [Range(0, 23)]
    public int EarliestHourLocal { get; set; } = 9;

    /// <summary>Latest local hour by which an opportunity must end. Defaults to 17:00.</summary>
    [Range(1, 24)]
    public int LatestHourLocal { get; set; } = 17;

    /// <summary>
    /// Daily local-time windows that are subtracted from the allowed hours
    /// (e.g. lunch 12:00–13:00). Applied per local calendar day after the
    /// EarliestHour/LatestHour intersection, so a single configuration value
    /// applies on every day in the query window.
    /// </summary>
    public List<BlackoutWindow> BlackoutWindowsLocal { get; set; } = [];
}

/// <summary>Half-open local-time-of-day window <c>[Start, End)</c>.</summary>
public sealed class BlackoutWindow
{
    [Range(0, 23)]
    public int StartHour { get; set; }

    [Range(0, 59)]
    public int StartMinute { get; set; }

    /// <summary>End hour. 24 is allowed to express "end of day".</summary>
    [Range(0, 24)]
    public int EndHour { get; set; }

    [Range(0, 59)]
    public int EndMinute { get; set; }
}
