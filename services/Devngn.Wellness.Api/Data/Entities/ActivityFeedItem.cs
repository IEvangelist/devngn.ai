// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Text.Json;

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A single item in a user's activity feed. <see cref="Metadata"/> stores
/// type-specific extra data (e.g. badge key, level number) as a JSON blob.
/// </summary>
public sealed class ActivityFeedItem
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public FeedItemType Type { get; set; }

    public string Message { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Optional JSON metadata stored as PostgreSQL <c>jsonb</c>.</summary>
    public JsonDocument? Metadata { get; set; }
}
