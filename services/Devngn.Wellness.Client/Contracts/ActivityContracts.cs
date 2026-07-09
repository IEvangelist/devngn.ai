// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>One instruction in an activity's guided sequence (empty for simple activities).</summary>
public sealed record ActivityStep(
    string Text,
    int? HoldSeconds = null,
    int? Reps = null,
    int? Sets = null);

/// <summary>A catalog activity that can be suggested during a gap.</summary>
public sealed record ActivityResponse(
    Guid Id,
    string Slug,
    string Title,
    string Description,
    BodyArea BodyArea,
    IntensityLevel Intensity,
    int DurationSeconds,
    string[] EquipmentTags,
    string AnimationProvider,
    string AnimationAssetId,
    string? LicenseAttribution,
    ActivityStep[] Steps);
