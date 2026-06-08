// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Schedule;

// =============================================================================
// Schedule sources
// =============================================================================

/// <summary>
/// Request body for <c>POST /v1/schedule/sources</c>.
/// </summary>
/// <remarks>
/// Phase 7a accepts only <see cref="ScheduleSourceType.User"/> sources (direct push from
/// the CLI/extension/site). Google and Microsoft sources are minted by the dedicated
/// OAuth connect endpoints in 7b/7c, not by this endpoint, because they need to capture
/// a refresh token and connection metadata that can't be supplied as plain JSON.
/// </remarks>
public sealed class CreateScheduleSourceRequest
{
    [Required]
    public ScheduleSourceType Type { get; set; }

    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string DisplayName { get; set; } = string.Empty;
}

/// <summary>Request body for <c>PATCH /v1/schedule/sources/{id}</c>.</summary>
public sealed class UpdateScheduleSourceRequest
{
    [StringLength(200, MinimumLength = 1)]
    public string? DisplayName { get; set; }

    /// <summary>
    /// Only <see cref="ScheduleSourceConnectionStatus.Connected"/> and
    /// <see cref="ScheduleSourceConnectionStatus.Disabled"/> are user-settable via PATCH;
    /// other transitions belong to the sync pipeline.
    /// </summary>
    public ScheduleSourceConnectionStatus? ConnectionStatus { get; set; }
}

public sealed record ScheduleSourceResponse(
    Guid Id,
    ScheduleSourceType Type,
    string DisplayName,
    ScheduleSourceConnectionStatus ConnectionStatus,
    string? Scope,
    DateTimeOffset? LastSyncAt,
    DateTimeOffset? LastRefreshAt,
    string? LastSyncErrorCode,
    DateTimeOffset? LastSyncErrorAt,
    DateTimeOffset CreatedAt);

// =============================================================================
// Schedule events (direct push)
// =============================================================================

/// <summary>
/// Single event item for <c>POST /v1/schedule/events</c>.
/// <see cref="ExternalId"/> is required because the API uses
/// <c>(SourceId, ExternalId)</c> uniqueness for idempotent retries; pushes without a
/// stable ID are rejected to avoid silently duplicating events on network retries.
/// </summary>
public sealed class PushScheduleEventItem
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string ExternalId { get; set; } = string.Empty;

    [Required]
    public DateTimeOffset StartUtc { get; set; }

    [Required]
    public DateTimeOffset EndUtc { get; set; }

    public bool Busy { get; set; } = true;
}

public sealed class PushScheduleEventsRequest
{
    [Required]
    public Guid SourceId { get; set; }

    /// <summary>Hard-capped at 200 to keep a single batch under the practical statement-timeout budget.</summary>
    [Required]
    [MinLength(1)]
    [MaxLength(200)]
    public List<PushScheduleEventItem> Items { get; set; } = [];
}

public sealed record ScheduleEventResponse(
    Guid Id,
    Guid SourceId,
    string? ExternalId,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc,
    bool Busy);

/// <summary>Response body for a successful <c>POST /v1/schedule/sources/{id}/sync</c>.</summary>
public sealed record ScheduleSyncResponse(int Synced);
