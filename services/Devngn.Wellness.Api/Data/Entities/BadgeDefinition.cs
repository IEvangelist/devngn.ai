// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// System-defined badge that a user can earn. The <see cref="Key"/> is the stable
/// identifier; <see cref="IsHidden"/> controls whether unearned badges are disclosed.
/// </summary>
public sealed class BadgeDefinition
{
    /// <summary>Stable lower-kebab key (e.g. "first-steps", "night-owl").</summary>
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Icon identifier (e.g. emoji or icon slug for the frontend).</summary>
    public string Icon { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    /// <summary>
    /// Minimum total XP required to unlock this badge (0 = no XP requirement).
    /// Badge is also evaluated for custom criteria via <see cref="GamificationService"/>.
    /// </summary>
    public int XpThreshold { get; set; }

    /// <summary>Hidden badges are anonymized in the response until earned.</summary>
    public bool IsHidden { get; set; }
}
