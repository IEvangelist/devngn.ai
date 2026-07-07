// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>Badge a specific user has earned.</summary>
public sealed class UserBadge
{
    public Guid UserId { get; set; }

    public string BadgeKey { get; set; } = string.Empty;

    public DateTimeOffset EarnedAt { get; set; } = DateTimeOffset.UtcNow;

    public BadgeDefinition? Badge { get; set; }
}
