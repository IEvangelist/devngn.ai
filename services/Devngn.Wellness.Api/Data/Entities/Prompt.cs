// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A specific activity that was suggested to a user for a specific gap. Tracks
/// delivery, dismissal, completion, and a small rating to feed back into matching.
/// </summary>
public sealed class Prompt
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public Guid ActivityId { get; set; }

    /// <summary>Start of the gap that triggered this prompt.</summary>
    public DateTimeOffset GapStartUtc { get; set; }

    /// <summary>End of the gap that triggered this prompt.</summary>
    public DateTimeOffset GapEndUtc { get; set; }

    public DateTimeOffset DeliveredAt { get; set; } = DateTimeOffset.UtcNow;

    public DeliveryChannel DeliveredVia { get; set; }

    public DateTimeOffset? DismissedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>Optional 1-5 user rating used to nudge future selections.</summary>
    public short? FeedbackRating { get; set; }

    public User? User { get; set; }

    public Activity? Activity { get; set; }
}
