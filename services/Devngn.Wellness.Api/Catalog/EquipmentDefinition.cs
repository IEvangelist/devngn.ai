// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// A curated, registerable piece of equipment. The catalog is stateless metadata shipped
/// with the assembly: it powers the equipment picker UI and the recommender's cadence
/// policy (e.g. an under-desk treadmill's weekly-session target). Registering equipment
/// still creates a per-user <see cref="Equipment"/> row keyed by <see cref="Tag"/>.
/// </summary>
/// <param name="Tag">Lower-kebab stable tag matched against activity requirements.</param>
/// <param name="DisplayName">Human-friendly label (e.g. "Under-desk treadmill").</param>
/// <param name="Category">Grouping used to organise the picker.</param>
/// <param name="Description">Optional one-line helper describing the gear.</param>
/// <param name="RecommendedWeeklySessions">
/// Optional cadence target: how many times per week the recommender should try to land an
/// activity using this equipment. Drives a strong scoring bonus while the user is behind.
/// </param>
/// <param name="MinSessionMinutes">
/// Optional preferred minimum session length, in minutes, for this equipment. When a gap
/// is long enough, the recommender favours activities that meet it.
/// </param>
public sealed record EquipmentDefinition(
    string Tag,
    string DisplayName,
    EquipmentCategory Category,
    string? Description = null,
    int? RecommendedWeeklySessions = null,
    int? MinSessionMinutes = null);
