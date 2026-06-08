// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Request body for registering a piece of equipment.</summary>
public sealed record CreateEquipmentRequest
{
    /// <summary>Lower-kebab-case tag (e.g. "mat", "bands-light").</summary>
    public string Tag { get; init; } = string.Empty;

    /// <summary>Human-friendly display name.</summary>
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>Optional notes.</summary>
    public string? Notes { get; init; }
}

/// <summary>Request body for updating a piece of equipment. The tag is immutable.</summary>
public sealed record UpdateEquipmentRequest
{
    /// <summary>Human-friendly display name.</summary>
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>Optional notes.</summary>
    public string? Notes { get; init; }
}

/// <summary>A registered piece of equipment.</summary>
public sealed record EquipmentResponse(
    Guid Id,
    string Tag,
    string DisplayName,
    string? Notes,
    DateTimeOffset CreatedAt);
