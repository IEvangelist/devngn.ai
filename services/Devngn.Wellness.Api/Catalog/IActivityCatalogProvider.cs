// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// Source of the wellness activity catalog (movement, mobility, breathing, posture).
/// Implementations supply pre-validated <see cref="ActivityDefinition"/> rows that
/// <see cref="ActivityCatalogSeeder"/> upserts into the database at startup.
/// </summary>
/// <remarks>
/// Providers MUST validate their own output (unique slugs, lower-kebab shape,
/// non-empty required strings, positive duration) before returning it; the
/// seeder treats the returned list as trusted catalog input.
/// </remarks>
public interface IActivityCatalogProvider
{
    /// <summary>Returns the full catalog. Implementations may cache the result.</summary>
    Task<IReadOnlyList<ActivityDefinition>> GetCatalogAsync(CancellationToken cancellationToken);
}
