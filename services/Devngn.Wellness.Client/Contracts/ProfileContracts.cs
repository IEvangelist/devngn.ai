// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Request body for creating or replacing the caller's wellness profile.</summary>
public sealed record UpsertProfileRequest
{
    /// <summary>Optional self-reported age range (e.g. "30-39").</summary>
    public string? AgeRange { get; init; }

    /// <summary>Optional height in centimetres.</summary>
    public decimal? HeightCm { get; init; }

    /// <summary>Optional weight in kilograms.</summary>
    public decimal? WeightKg { get; init; }

    /// <summary>Self-reported baseline activity level.</summary>
    public FitnessBaseline FitnessBaseline { get; init; } = FitnessBaseline.Unspecified;

    /// <summary>Preferred activity intensity.</summary>
    public IntensityLevel PreferredIntensity { get; init; } = IntensityLevel.Low;

    /// <summary>Optional free-text injuries or limitations.</summary>
    public string? Limitations { get; init; }

    /// <summary>Optional preferred time-of-day for prompts.</summary>
    public string? TimeOfDayPreference { get; init; }
}

/// <summary>The caller's wellness profile.</summary>
public sealed record ProfileResponse(
    Guid Id,
    string? AgeRange,
    decimal? HeightCm,
    decimal? WeightKg,
    FitnessBaseline FitnessBaseline,
    IntensityLevel PreferredIntensity,
    string? Limitations,
    string? TimeOfDayPreference,
    DateTimeOffset UpdatedAt);
