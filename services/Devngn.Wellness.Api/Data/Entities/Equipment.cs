// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A piece of wellness equipment a user has registered as available. The matcher will
/// only suggest activities whose required tags are a subset of the user's tag set.
/// </summary>
public sealed class Equipment
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    /// <summary>Stable lower-kebab tag (e.g. "mat", "bands-light", "standing-desk").</summary>
    public string Tag { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }
}
