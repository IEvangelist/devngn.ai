// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Coarse-grained area of the body an <see cref="Activity"/> targets.
/// Used to filter prompts against the user's profile and goals.
/// </summary>
public enum BodyArea
{
    Full,
    Upper,
    Lower,
    Core,
    Neck,
    Back,
    Wrists,
    Hips,
    Ankles,
    Breath,
    Posture,
}

/// <summary>
/// Intensity tier applied to activities and to the user's profile preference.
/// </summary>
public enum IntensityLevel
{
    Low,
    Medium,
    High,
}

/// <summary>
/// User's self-reported baseline activity level. Used for activity recommendations.
/// </summary>
public enum FitnessBaseline
{
    Unspecified,
    Sedentary,
    Light,
    Moderate,
    Active,
}

/// <summary>
/// High-level category for a wellness goal. Mirrors the activity catalog vocabulary.
/// </summary>
public enum GoalCategory
{
    Mobility,
    Strength,
    Breathing,
    Posture,
    CardioLight,
}

/// <summary>
/// Origin of a <see cref="ScheduleEvent"/>. User events are pushed by the dev directly;
/// Google and Microsoft are read-only free/busy syncs.
/// </summary>
public enum ScheduleSourceType
{
    User,
    Google,
    Microsoft,
}

/// <summary>
/// Channel a <see cref="Prompt"/> was delivered through.
/// </summary>
public enum DeliveryChannel
{
    Vscode,
    Cli,
    Web,
    App,
}
