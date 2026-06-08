// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Coarse-grained area of the body an activity targets.</summary>
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

/// <summary>Intensity tier applied to activities and to the user's profile preference.</summary>
public enum IntensityLevel
{
    Low,
    Medium,
    High,
}

/// <summary>User's self-reported baseline activity level.</summary>
public enum FitnessBaseline
{
    Unspecified,
    Sedentary,
    Light,
    Moderate,
    Active,
}

/// <summary>High-level category for a wellness goal.</summary>
public enum GoalCategory
{
    Mobility,
    Strength,
    Breathing,
    Posture,
    CardioLight,
}

/// <summary>Origin of a schedule source.</summary>
public enum ScheduleSourceType
{
    User,
    Google,
    Microsoft,
}

/// <summary>Lifecycle status of a schedule source's connection to its upstream provider.</summary>
public enum ScheduleSourceConnectionStatus
{
    Connected,
    NeedsReconnect,
    Disabled,
    Error,
    PendingConnection,
}

/// <summary>Channel a prompt was delivered through.</summary>
public enum DeliveryChannel
{
    Vscode,
    Cli,
    Web,
}
