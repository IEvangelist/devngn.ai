// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>Milestone a specific user has achieved.</summary>
public sealed class UserMilestone
{
    public Guid UserId { get; set; }

    public string MilestoneKey { get; set; } = string.Empty;

    public DateTimeOffset AchievedAt { get; set; } = DateTimeOffset.UtcNow;

    public MilestoneDefinition? Milestone { get; set; }
}
