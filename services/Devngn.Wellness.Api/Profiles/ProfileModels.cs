// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Profiles;

internal sealed record UpsertProfileRequest
{
    [StringLength(20)]
    public string? AgeRange { get; init; }

    [Range(typeof(decimal), "30", "300")]
    public decimal? HeightCm { get; init; }

    [Range(typeof(decimal), "20", "500")]
    public decimal? WeightKg { get; init; }

    [EnumDataType(typeof(FitnessBaseline))]
    public FitnessBaseline FitnessBaseline { get; init; } = FitnessBaseline.Unspecified;

    [EnumDataType(typeof(IntensityLevel))]
    public IntensityLevel PreferredIntensity { get; init; } = IntensityLevel.Low;

    [StringLength(2000)]
    public string? Limitations { get; init; }

    [StringLength(100)]
    public string? TimeOfDayPreference { get; init; }
}

internal sealed record ProfileResponse(
    Guid Id,
    string? AgeRange,
    decimal? HeightCm,
    decimal? WeightKg,
    FitnessBaseline FitnessBaseline,
    IntensityLevel PreferredIntensity,
    string? Limitations,
    string? TimeOfDayPreference,
    DateTimeOffset UpdatedAt);
