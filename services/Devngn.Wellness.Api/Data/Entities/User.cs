// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A devngn.ai user authenticated through GitHub. The root aggregate of the
/// wellness graph: all profile, goal, equipment, schedule, and prompt data
/// hangs off a <see cref="User"/>.
/// </summary>
public sealed class User
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>GitHub numeric user id; the stable external identity.</summary>
    public long GitHubId { get; set; }

    /// <summary>GitHub login (handle). May change over time; not a primary key.</summary>
    public string Login { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    public string? AvatarUrl { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ConsentRecord? Consent { get; set; }

    public Profile? Profile { get; set; }

    public ICollection<Goal> Goals { get; set; } = [];

    public ICollection<Equipment> Equipment { get; set; } = [];

    public ICollection<ScheduleSource> ScheduleSources { get; set; } = [];

    public ICollection<ScheduleEvent> ScheduleEvents { get; set; } = [];

    public ICollection<Prompt> Prompts { get; set; } = [];
}
