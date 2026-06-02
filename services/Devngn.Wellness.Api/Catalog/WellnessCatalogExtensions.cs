// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Catalog;

public static class WellnessCatalogExtensions
{
    /// <summary>
    /// Registers the activity-catalog provider (<see cref="EmbeddedActivityCatalogProvider"/>
    /// by default) and the <see cref="ActivityCatalogSeeder"/> hosted service. The seeder
    /// validates the embedded catalog and upserts rows into <c>Activities</c> on startup.
    /// </summary>
    public static IServiceCollection AddWellnessActivityCatalog(this IServiceCollection services)
    {
        // The embedded provider is stateless once initialised, so a singleton is correct;
        // it also caches the parsed catalog so requests don't re-deserialise per call.
        services.AddSingleton<IActivityCatalogProvider, EmbeddedActivityCatalogProvider>();
        services.AddHostedService<ActivityCatalogSeeder>();
        return services;
    }
}
