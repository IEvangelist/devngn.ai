// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Bound from the <c>Prompts</c> configuration section. Tunes the prompt-delivery
/// surface (streaming cadence, look-ahead horizon, history paging, and how far back
/// the matcher looks to keep suggestions varied). Cooldown / allowed-hours live in
/// <see cref="Schedule.Gaps.GapDetectionOptions"/> because the gap engine owns the
/// "is a gap eligible right now" decision.
/// </summary>
public sealed class PromptDeliveryOptions
{
    public const string SectionName = "Prompts";

    /// <summary>
    /// Seconds the SSE / WebSocket loop waits between detection passes. A prompt is
    /// emitted at most once per cooldown window regardless of this value, so it only
    /// controls how quickly a freshly-opened gap is noticed.
    /// </summary>
    [Range(1, 3600)]
    public int StreamPollSeconds { get; set; } = 30;

    /// <summary>
    /// How far ahead the service detects gaps when looking for the currently-active
    /// one. The engine caps each emitted gap to <c>MaxGapMinutes</c>, so a generous
    /// horizon is harmless — it only widens the busy-event query window.
    /// </summary>
    [Range(5, 20160)]
    public int LookaheadMinutes { get; set; } = 240;

    /// <summary>Default number of history rows returned by <c>GET /v1/prompts</c>.</summary>
    [Range(1, 1000)]
    public int HistoryDefaultLimit { get; set; } = 50;

    /// <summary>Hard cap on the history page size, regardless of the caller's <c>limit</c>.</summary>
    [Range(1, 1000)]
    public int HistoryMaxLimit { get; set; } = 100;

    /// <summary>
    /// Window over which recently-delivered activities are de-prioritised so the user
    /// doesn't see the same suggestion back-to-back. Set to 0 to disable variety bias.
    /// </summary>
    [Range(0, 20160)]
    public int RecentVarietyWindowMinutes { get; set; } = 240;
}
