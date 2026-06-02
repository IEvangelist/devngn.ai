// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// User-controlled wellness profile. Every field is optional and self-reported. Used to
/// tune activity recommendations - never published to any public registry.
/// </summary>
public sealed class Profile
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    /// <summary>Coarse age band (e.g. "30-39") to avoid storing date of birth.</summary>
    public string? AgeRange { get; set; }

    public decimal? HeightCm { get; set; }

    public decimal? WeightKg { get; set; }

    public FitnessBaseline FitnessBaseline { get; set; } = FitnessBaseline.Unspecified;

    public IntensityLevel PreferredIntensity { get; set; } = IntensityLevel.Low;

    /// <summary>Free-text limitations / injuries the user wants the engine to respect.</summary>
    public string? Limitations { get; set; }

    /// <summary>Comma-separated time-of-day tokens (e.g. "morning,afternoon").</summary>
    public string? TimeOfDayPreference { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }
}
