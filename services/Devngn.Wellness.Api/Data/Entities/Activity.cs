// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A short, prompt-able wellness activity in the catalog. Visual assets are referenced,
/// not stored, so the wellness service stays small and the third-party animation library
/// remains the single source of truth for media.
/// </summary>
public sealed class Activity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Stable, URL-safe identifier (e.g. "shoulder-rolls").</summary>
    public string Slug { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public BodyArea BodyArea { get; set; }

    public IntensityLevel Intensity { get; set; }

    /// <summary>Typical execution duration; the matcher prefers activities that fit the gap.</summary>
    public int DurationSeconds { get; set; }

    /// <summary>
    /// Equipment tags required to perform the activity. Matched as a subset of the
    /// user's registered <see cref="Equipment"/> tags (case-sensitive lower-kebab).
    /// </summary>
    public string[] EquipmentTags { get; set; } = [];

    /// <summary>Provider key (e.g. "lottiefiles", "local") for the visual asset.</summary>
    public string AnimationProvider { get; set; } = string.Empty;

    /// <summary>Provider-scoped asset id for the visual.</summary>
    public string AnimationAssetId { get; set; } = string.Empty;

    /// <summary>Attribution string surfaced to the user when the prompt is shown.</summary>
    public string? LicenseAttribution { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
