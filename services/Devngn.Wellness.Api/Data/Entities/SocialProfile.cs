// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Public-facing social profile. <see cref="IsPublic"/> controls whether this user
/// appears in the leaderboard and can be followed by others.
/// </summary>
public sealed class SocialProfile
{
    public Guid UserId { get; set; }

    /// <summary>User-chosen display name (sanitized via profanity filter).</summary>
    public string DisplayName { get; set; } = string.Empty;

    public string? Bio { get; set; }

    public bool IsPublic { get; set; } = true;
}
