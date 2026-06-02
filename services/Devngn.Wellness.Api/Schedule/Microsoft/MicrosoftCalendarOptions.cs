// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Schedule.Microsoft;

public sealed class MicrosoftCalendarOptions
{
    public const string SectionName = "Auth:Microsoft";

    [Required]
    public string ClientId { get; set; } = string.Empty;

    [Required]
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>
    /// Absolute callback URL registered with the Microsoft Entra app registration. Must
    /// match what's configured in the Azure portal exactly, including scheme and port.
    /// </summary>
    [Required]
    [Url]
    public string RedirectUri { get; set; } = string.Empty;

    /// <summary>
    /// Authority tenant. <c>common</c> = work/school accounts in any Entra tenant +
    /// personal Microsoft accounts. Set to a specific GUID/domain for single-tenant apps.
    /// </summary>
    [Required]
    public string TenantId { get; set; } = "common";

    /// <summary>
    /// Scopes requested at <c>/authorize</c>. <c>offline_access</c> is required for
    /// Microsoft to mint a refresh token; <c>Calendars.Read</c> is the resource permission
    /// we need (read-only). We do NOT request <c>Calendars.ReadBasic</c> because the
    /// busy-window classification depends on <c>showAs</c> + <c>isCancelled</c>, both of
    /// which are projected to us via <c>$select</c> rather than implicitly exposed.
    /// </summary>
    public string Scope { get; set; } = "Calendars.Read offline_access";

    /// <summary>How far ahead each sync pull is. Matches the gap-detection horizon in phase 8.</summary>
    public TimeSpan SyncWindow { get; set; } = TimeSpan.FromDays(14);

    /// <summary>OAuth state record TTL. Same default as the Google flow.</summary>
    public TimeSpan OAuthStateTtl { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Per-call timeout for token + calendarView requests.</summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(15);

    /// <summary>
    /// Maximum number of pages of <c>@odata.nextLink</c> the sync service will follow
    /// before giving up. Defensive bound against a pathological account; 14-day windows
    /// with $top=999 should fit comfortably in a single page for typical users.
    /// </summary>
    public int MaxPagesPerSync { get; set; } = 10;
}
