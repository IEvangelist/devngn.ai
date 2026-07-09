// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// Supplies the curated equipment catalog: the set of gear a user can register, along
/// with any recommender cadence policy attached to each item. Implementations are expected
/// to validate their source once and cache the result.
/// </summary>
public interface IEquipmentCatalogProvider
{
    /// <summary>Returns the validated equipment catalog.</summary>
    Task<IReadOnlyList<EquipmentDefinition>> GetCatalogAsync(CancellationToken cancellationToken);
}
