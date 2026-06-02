// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A schedule provider the user has connected. Holds an opaque reference to OAuth
/// credentials stored outside the wellness service (no raw tokens persisted here).
/// </summary>
public sealed class ScheduleSource
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public ScheduleSourceType Type { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Opaque key into the credential store. Null for <see cref="ScheduleSourceType.User"/>
    /// sources that are populated by direct API push.
    /// </summary>
    public string? CredentialRef { get; set; }

    public bool IsEnabled { get; set; } = true;

    public DateTimeOffset? LastSyncAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }

    public ICollection<ScheduleEvent> Events { get; set; } = [];
}
