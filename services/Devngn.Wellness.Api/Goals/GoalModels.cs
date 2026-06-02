// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Goals;

internal sealed record CreateGoalRequest
{
    [Required]
    [StringLength(120, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [StringLength(2000)]
    public string? Description { get; init; }

    [EnumDataType(typeof(GoalCategory))]
    public GoalCategory Category { get; init; } = GoalCategory.Mobility;

    [StringLength(80)]
    public string? TargetMetric { get; init; }

    [Required]
    public DateOnly StartDate { get; init; }

    public DateOnly? EndDate { get; init; }
}

internal sealed record UpdateGoalRequest
{
    [Required]
    [StringLength(120, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [StringLength(2000)]
    public string? Description { get; init; }

    [EnumDataType(typeof(GoalCategory))]
    public GoalCategory Category { get; init; } = GoalCategory.Mobility;

    [StringLength(80)]
    public string? TargetMetric { get; init; }

    [Required]
    public DateOnly StartDate { get; init; }

    public DateOnly? EndDate { get; init; }
}

internal sealed record GoalResponse(
    Guid Id,
    string Title,
    string? Description,
    GoalCategory Category,
    string? TargetMetric,
    DateOnly StartDate,
    DateOnly? EndDate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
