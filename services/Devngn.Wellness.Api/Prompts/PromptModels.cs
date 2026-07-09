// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Wire shape for a delivered prompt. Embeds the activity's display fields so a client
/// (VS Code toast, CLI notification) can render immediately without a second round-trip
/// to <c>GET /v1/activities</c>.
/// </summary>
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
    ActivityStep[] Steps,
    DateTimeOffset GapStartUtc,
    DateTimeOffset GapEndUtc,
    DateTimeOffset DeliveredAt,
    DeliveryChannel DeliveredVia,
    DateTimeOffset? DismissedAt,
    DateTimeOffset? CompletedAt,
    short? FeedbackRating)
{
    public static PromptResponse From(Prompt prompt, Activity activity) => new(
        prompt.Id,
        activity.Id,
        activity.Slug,
        activity.Title,
        activity.Description,
        activity.BodyArea,
        activity.Intensity,
        activity.DurationSeconds,
        activity.EquipmentTags,
        activity.AnimationProvider,
        activity.AnimationAssetId,
        activity.LicenseAttribution,
        activity.Steps,
        prompt.GapStartUtc,
        prompt.GapEndUtc,
        prompt.DeliveredAt,
        prompt.DeliveredVia,
        prompt.DismissedAt,
        prompt.CompletedAt,
        prompt.FeedbackRating);
}

/// <summary>Body for <c>POST /v1/prompts/{id}/feedback</c>.</summary>
internal sealed record FeedbackRequest
{
    /// <summary>A 1-5 satisfaction rating used to nudge future selections.</summary>
    [Range(1, 5)]
    public short Rating { get; init; }
}
