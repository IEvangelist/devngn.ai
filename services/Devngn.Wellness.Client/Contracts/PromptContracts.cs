// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>A delivered prompt, embedding the activity's display fields for immediate rendering.</summary>
public sealed record PromptResponse(
    Guid Id,
    Guid ActivityId,
    string ActivitySlug,
    string ActivityTitle,
    string ActivityDescription,
    BodyArea BodyArea,
    IntensityLevel Intensity,
    int DurationSeconds,
    string[] EquipmentTags,
    string AnimationProvider,
    string AnimationAssetId,
    string? LicenseAttribution,
    DateTimeOffset GapStartUtc,
    DateTimeOffset GapEndUtc,
    DateTimeOffset DeliveredAt,
    DeliveryChannel DeliveredVia,
    DateTimeOffset? DismissedAt,
    DateTimeOffset? CompletedAt,
    short? FeedbackRating);

/// <summary>Request body for submitting feedback on a delivered prompt.</summary>
public sealed record FeedbackRequest
{
    /// <summary>A 1-5 satisfaction rating used to nudge future selections.</summary>
    public short Rating { get; init; }
}
