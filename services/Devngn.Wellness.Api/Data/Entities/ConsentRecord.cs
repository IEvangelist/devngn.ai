// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Versioned, immutable record of a user's consent to store wellness profile data.
/// The wellness service refuses to persist <see cref="Profile"/>, <see cref="Goal"/>,
/// or <see cref="Equipment"/> rows for users without a current consent record.
/// </summary>
public sealed class ConsentRecord
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    /// <summary>Semver-ish identifier for the consent text the user accepted (e.g. "1.0").</summary>
    public string Version { get; set; } = string.Empty;

    /// <summary>Verbatim consent text captured at acceptance time for auditability.</summary>
    public string Text { get; set; } = string.Empty;

    public DateTimeOffset AcceptedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }
}
