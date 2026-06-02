// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Schedule.Google;

public sealed class GoogleCalendarOptions
{
    public const string SectionName = "Auth:Google";

    [Required]
    public string ClientId { get; set; } = string.Empty;

    [Required]
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>
    /// Absolute callback URL registered with the Google OAuth client. Must match what's
    /// configured in the Google Cloud console exactly, including scheme and port.
    /// </summary>
    [Required]
    [Url]
    public string RedirectUri { get; set; } = string.Empty;

    /// <summary>
    /// Least-privilege scope: read-only free/busy windows. Requesting full
    /// <c>calendar.readonly</c> would also return event titles which we deliberately
    /// never persist (see <c>ScheduleEvent</c>).
    /// </summary>
    public string Scope { get; set; } = "https://www.googleapis.com/auth/calendar.freebusy";

    /// <summary>How far ahead each sync pull is. Matches the gap-detection horizon in phase 8.</summary>
    public TimeSpan SyncWindow { get; set; } = TimeSpan.FromDays(14);

    /// <summary>OAuth state record TTL. Long enough to survive consent friction; short enough that abandoned flows are GC'd quickly.</summary>
    public TimeSpan OAuthStateTtl { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Per-call timeout for token + free/busy requests.</summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(15);
}
