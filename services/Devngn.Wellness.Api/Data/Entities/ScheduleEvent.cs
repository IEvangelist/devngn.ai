// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Free/busy time block derived from a connected schedule. Privacy by design:
/// no titles, bodies, attendees, or descriptions are ever persisted.
/// </summary>
public sealed class ScheduleEvent
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public Guid SourceId { get; set; }

    public DateTimeOffset StartUtc { get; set; }

    public DateTimeOffset EndUtc { get; set; }

    /// <summary>True if the slot should be treated as busy when computing gaps.</summary>
    public bool Busy { get; set; } = true;

    /// <summary>
    /// Stable id from the upstream provider (Google/Microsoft) used to deduplicate
    /// ingest passes. Never holds user-authored content.
    /// </summary>
    public string? ExternalId { get; set; }

    public DateTimeOffset IngestedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }

    public ScheduleSource? Source { get; set; }
}
