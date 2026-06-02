// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// On startup, fetches the catalog from <see cref="IActivityCatalogProvider"/> and
/// upserts each definition into the database keyed by <see cref="Activity.Slug"/>.
/// Rows that already exist are updated in-place only when their content has changed,
/// so the seeder is cheap and idempotent across restarts. Rows present in the DB but
/// not in the provider are NOT deleted (a future provider may extend the catalog and
/// we don't want to drop user-facing data on a temporary regression).
/// </summary>
/// <remarks>
/// The seeder uses <see cref="IServiceScopeFactory"/> to obtain a scoped
/// <see cref="WellnessDbContext"/>; the seeder itself is registered as a hosted
/// service (singleton), so capturing the scoped context directly would be a
/// lifetime trap.
/// </remarks>
internal sealed class ActivityCatalogSeeder(
    IServiceScopeFactory scopeFactory,
    IActivityCatalogProvider provider,
    ILogger<ActivityCatalogSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Resolve the catalog first so a malformed embedded JSON fails startup
        // *before* we open a DB transaction. If the catalog itself is broken,
        // the right behaviour is to refuse to come up — running with a stale or
        // empty catalog while health checks are green is worse than a hard fail.
        var definitions = await provider.GetCatalogAsync(cancellationToken);

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();

        var slugs = definitions.Select(static d => d.Slug).ToArray();
        var existing = await db.Activities
            .Where(a => slugs.Contains(a.Slug))
            .ToDictionaryAsync(static a => a.Slug, cancellationToken)
            .ConfigureAwait(false);

        var inserted = 0;
        var updated = 0;

        foreach (var d in definitions)
        {
            if (existing.TryGetValue(d.Slug, out var current))
            {
                if (HasChanges(current, d))
                {
                    Apply(d, current);
                    updated++;
                }
            }
            else
            {
                db.Activities.Add(ToEntity(d));
                inserted++;
            }
        }

        if (inserted > 0 || updated > 0)
        {
            await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        logger.LogInformation(
            "Activity catalog seeded: {Inserted} inserted, {Updated} updated, {Unchanged} unchanged.",
            inserted, updated, definitions.Count - inserted - updated);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static Activity ToEntity(ActivityDefinition d) => new()
    {
        Slug = d.Slug,
        Title = d.Title,
        Description = d.Description,
        BodyArea = d.BodyArea,
        Intensity = d.Intensity,
        DurationSeconds = d.DurationSeconds,
        EquipmentTags = (string[])d.EquipmentTags.Clone(),
        AnimationProvider = d.AnimationProvider,
        AnimationAssetId = d.AnimationAssetId,
        LicenseAttribution = d.LicenseAttribution,
    };

    private static void Apply(ActivityDefinition d, Activity target)
    {
        target.Title = d.Title;
        target.Description = d.Description;
        target.BodyArea = d.BodyArea;
        target.Intensity = d.Intensity;
        target.DurationSeconds = d.DurationSeconds;
        target.EquipmentTags = (string[])d.EquipmentTags.Clone();
        target.AnimationProvider = d.AnimationProvider;
        target.AnimationAssetId = d.AnimationAssetId;
        target.LicenseAttribution = d.LicenseAttribution;
    }

    private static bool HasChanges(Activity current, ActivityDefinition d) =>
        current.Title != d.Title
        || current.Description != d.Description
        || current.BodyArea != d.BodyArea
        || current.Intensity != d.Intensity
        || current.DurationSeconds != d.DurationSeconds
        || current.AnimationProvider != d.AnimationProvider
        || current.AnimationAssetId != d.AnimationAssetId
        || current.LicenseAttribution != d.LicenseAttribution
        || !current.EquipmentTags.SequenceEqual(d.EquipmentTags, StringComparer.Ordinal);
}
