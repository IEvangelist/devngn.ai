// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Social;

internal sealed record UpsertSocialProfileRequest
{
    [Required]
    [StringLength(80, MinimumLength = 1)]
    public string DisplayName { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Bio { get; init; }

    public bool IsPublic { get; init; } = true;
}

internal sealed record SocialProfileResponse(
    Guid UserId,
    string DisplayName,
    string? Bio,
    bool IsPublic);

internal sealed record FollowResponse(
    Guid FolloweeId,
    DateTimeOffset FollowedAt);

internal sealed record FollowerResponse(
    Guid FollowerId,
    DateTimeOffset FollowedAt);

internal sealed record FeedItemResponse(
    Guid Id,
    FeedItemType Type,
    string Message,
    DateTimeOffset CreatedAt);
