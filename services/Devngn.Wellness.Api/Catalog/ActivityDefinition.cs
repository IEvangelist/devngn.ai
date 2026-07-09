// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// Provider-emitted catalog entry. This is the wire/JSON contract for
/// <see cref="IActivityCatalogProvider"/> implementations and is intentionally
/// decoupled from the persisted <see cref="Activity"/> entity (no surrogate
/// <c>Id</c> or <c>CreatedAt</c>; <see cref="Slug"/> is the natural key).
/// </summary>
/// <remarks>
/// Validation rules enforced by <see cref="EmbeddedActivityCatalogProvider"/>:
/// <list type="bullet">
///   <item><see cref="Slug"/> matches <c>^[a-z0-9]+(-[a-z0-9]+)*$</c>.</item>
///   <item><see cref="Title"/>, <see cref="Description"/>, <see cref="AnimationProvider"/>,
///         and <see cref="AnimationAssetId"/> are non-empty.</item>
///   <item><see cref="DurationSeconds"/> is &gt; 0.</item>
///   <item>Each entry in <see cref="EquipmentTags"/> matches the same
///         lower-kebab shape as the slug.</item>
///   <item><see cref="Steps"/> is optional; when present each step has non-empty
///         text and any numeric field (hold/reps/sets) is positive.</item>
/// </list>
/// </remarks>
public sealed record ActivityDefinition(
    string Slug,
    string Title,
    string Description,
    BodyArea BodyArea,
    IntensityLevel Intensity,
    int DurationSeconds,
    string[] EquipmentTags,
    string AnimationProvider,
    string AnimationAssetId,
    string? LicenseAttribution,
    ActivityStep[]? Steps = null);
