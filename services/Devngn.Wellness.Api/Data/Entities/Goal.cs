// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A wellness objective the user has set for themselves (e.g. "10 mobility breaks/day").
/// The matcher uses <see cref="Category"/> to bias activity selection during gaps.
/// </summary>
public sealed class Goal
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public GoalCategory Category { get; set; }

    /// <summary>Free-text metric the user is tracking (e.g. "10/day", "3 sessions/week").</summary>
    public string? TargetMetric { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }
}
