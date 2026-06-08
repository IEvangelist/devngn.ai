// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Request body for registering a user-pushed schedule source.</summary>
/// <remarks>
/// Only <see cref="ScheduleSourceType.User"/> sources can be created through the client.
/// Google and Microsoft sources are minted by the server's interactive OAuth connect
/// flow, which is outside the scope of this typed client.
/// </remarks>
public sealed record CreateScheduleSourceRequest
{
    /// <summary>The source type. Use <see cref="ScheduleSourceType.User"/> for direct push.</summary>
    public ScheduleSourceType Type { get; init; }

    /// <summary>Human-friendly display name.</summary>
    public string DisplayName { get; init; } = string.Empty;
}

/// <summary>Request body for patching a schedule source.</summary>
public sealed record UpdateScheduleSourceRequest
{
    /// <summary>Optional new display name.</summary>
    public string? DisplayName { get; init; }

    /// <summary>
    /// Optional new connection status. Only <see cref="ScheduleSourceConnectionStatus.Connected"/>
    /// and <see cref="ScheduleSourceConnectionStatus.Disabled"/> are user-settable.
    /// </summary>
    public ScheduleSourceConnectionStatus? ConnectionStatus { get; init; }
}

/// <summary>A registered schedule source.</summary>
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

/// <summary>A single event to push for a user-provided schedule source.</summary>
public sealed record PushScheduleEventItem
{
    /// <summary>Stable external id used for idempotent <c>(SourceId, ExternalId)</c> upserts.</summary>
    public string ExternalId { get; init; } = string.Empty;

    /// <summary>Event start (UTC).</summary>
    public DateTimeOffset StartUtc { get; init; }

    /// <summary>Event end (UTC).</summary>
    public DateTimeOffset EndUtc { get; init; }

    /// <summary>Whether the window counts as busy. Defaults to <see langword="true"/>.</summary>
    public bool Busy { get; init; } = true;
}

/// <summary>Request body for bulk-pushing events to a user-provided schedule source.</summary>
public sealed record PushScheduleEventsRequest
{
    /// <summary>The user-provided source the events belong to.</summary>
    public Guid SourceId { get; init; }

    /// <summary>The events to upsert. Capped at 200 per call by the server.</summary>
    public IReadOnlyList<PushScheduleEventItem> Items { get; init; } = [];
}

/// <summary>A persisted schedule event (free/busy window only; no titles or bodies).</summary>
public sealed record ScheduleEventResponse(
    Guid Id,
    Guid SourceId,
    string? ExternalId,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc,
    bool Busy);

/// <summary>Result of triggering a sync for a Google/Microsoft schedule source.</summary>
public sealed record ScheduleSyncResponse(int Synced);
