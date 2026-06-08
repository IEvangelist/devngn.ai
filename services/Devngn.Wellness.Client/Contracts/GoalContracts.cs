// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Request body for creating a goal.</summary>
public sealed record CreateGoalRequest
{
    /// <summary>Short goal title.</summary>
    public string Title { get; init; } = string.Empty;

    /// <summary>Optional longer description.</summary>
    public string? Description { get; init; }

    /// <summary>Goal category.</summary>
    public GoalCategory Category { get; init; } = GoalCategory.Mobility;

    /// <summary>Optional target metric (e.g. "10 mobility breaks/day").</summary>
    public string? TargetMetric { get; init; }

    /// <summary>Date the goal starts.</summary>
    public DateOnly StartDate { get; init; }

    /// <summary>Optional date the goal ends.</summary>
    public DateOnly? EndDate { get; init; }
}

/// <summary>Request body for replacing an existing goal.</summary>
public sealed record UpdateGoalRequest
{
    /// <summary>Short goal title.</summary>
    public string Title { get; init; } = string.Empty;

    /// <summary>Optional longer description.</summary>
    public string? Description { get; init; }

    /// <summary>Goal category.</summary>
    public GoalCategory Category { get; init; } = GoalCategory.Mobility;

    /// <summary>Optional target metric (e.g. "10 mobility breaks/day").</summary>
    public string? TargetMetric { get; init; }

    /// <summary>Date the goal starts.</summary>
    public DateOnly StartDate { get; init; }

    /// <summary>Optional date the goal ends.</summary>
    public DateOnly? EndDate { get; init; }
}

/// <summary>A wellness goal.</summary>
public sealed record GoalResponse(
    Guid Id,
    string Title,
    string? Description,
    GoalCategory Category,
    string? TargetMetric,
    DateOnly StartDate,
    DateOnly? EndDate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
