// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// System-defined milestone (a one-time achievement, e.g. "Complete 100 prompts").
/// Unlike badges, milestones have no XP threshold — they are tied to specific event counts.
/// </summary>
public sealed class MilestoneDefinition
{
    /// <summary>Stable lower-kebab key (e.g. "first-prompt", "ten-prompts").</summary>
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Hidden milestones are anonymized until achieved.</summary>
    public bool IsHidden { get; set; }
}
