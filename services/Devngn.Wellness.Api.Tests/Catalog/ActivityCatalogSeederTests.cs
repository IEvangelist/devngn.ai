// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Catalog;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Catalog;

/// <summary>
/// Integration tests for <see cref="ActivityCatalogSeeder"/> against a real
/// Postgres testcontainer. The hosted service is exercised directly via
/// <c>StartAsync</c> against the same DI scope the API would use, so we
/// observe the actual EF Core behaviour (including the unique-slug index).
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class ActivityCatalogSeederTests(PostgresContainerFixture postgres)
{
    [Fact]
    public async Task Seeder_inserts_full_production_catalog_into_empty_database()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ClearActivitiesAsync(factory);

        var seeder = ActivatorUtilities.CreateInstance<ActivityCatalogSeeder>(factory.Services);
        await seeder.StartAsync(CancellationToken.None);

        var (catalog, persisted) = await ReadAsync(factory);
        Assert.Equal(catalog.Count, persisted.Count);
        Assert.Equal(
            catalog.Select(c => c.Slug).OrderBy(s => s, StringComparer.Ordinal),
            persisted.Select(p => p.Slug).OrderBy(s => s, StringComparer.Ordinal));
    }

    [Fact]
    public async Task Seeder_is_idempotent_across_repeated_runs()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ClearActivitiesAsync(factory);

        var seeder = ActivatorUtilities.CreateInstance<ActivityCatalogSeeder>(factory.Services);
        await seeder.StartAsync(CancellationToken.None);
        await seeder.StartAsync(CancellationToken.None);
        await seeder.StartAsync(CancellationToken.None);

        var (catalog, persisted) = await ReadAsync(factory);
        Assert.Equal(catalog.Count, persisted.Count);
        Assert.Equal(catalog.Count, persisted.Select(p => p.Slug).Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task Seeder_updates_existing_row_when_definition_changes()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ClearActivitiesAsync(factory);

        // Pre-seed with a deliberately stale row. Slug is the natural key; the seeder
        // must keep this Id + CreatedAt while overwriting the mutated fields.
        var staleId = Guid.CreateVersion7();
        var staleCreatedAt = new DateTimeOffset(2024, 1, 1, 0, 0, 0, TimeSpan.Zero);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            db.Activities.Add(new Activity
            {
                Id = staleId,
                Slug = "shoulder-rolls",
                Title = "OLD TITLE",
                Description = "OLD DESCRIPTION",
                BodyArea = BodyArea.Wrists,
                Intensity = IntensityLevel.High,
                DurationSeconds = 1,
                EquipmentTags = ["stale-tag"],
                AnimationProvider = "old-provider",
                AnimationAssetId = "old-asset",
                LicenseAttribution = "old",
                CreatedAt = staleCreatedAt,
            });
            await db.SaveChangesAsync();
        }

        var seeder = ActivatorUtilities.CreateInstance<ActivityCatalogSeeder>(factory.Services);
        await seeder.StartAsync(CancellationToken.None);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            var row = await db.Activities.SingleAsync(a => a.Slug == "shoulder-rolls");
            Assert.Equal(staleId, row.Id);
            // CreatedAt is preserved (the seeder does not touch it). Use microsecond
            // tolerance to absorb Postgres timestamptz precision.
            Assert.True((row.CreatedAt - staleCreatedAt).Duration() < TimeSpan.FromMicroseconds(2),
                $"CreatedAt drifted: expected {staleCreatedAt:O}, got {row.CreatedAt:O}");
            Assert.NotEqual("OLD TITLE", row.Title);
            Assert.NotEqual("OLD DESCRIPTION", row.Description);
            Assert.NotEqual(BodyArea.Wrists, row.BodyArea);
            Assert.NotEqual(IntensityLevel.High, row.Intensity);
            Assert.DoesNotContain("stale-tag", row.EquipmentTags);
        }
    }

    [Fact]
    public async Task Seeder_preserves_unrelated_rows_present_in_db_but_absent_from_catalog()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ClearActivitiesAsync(factory);

        // A row whose slug is not in the embedded catalog — must survive seeding so a
        // future provider extension can introduce new sources without losing data.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            db.Activities.Add(new Activity
            {
                Slug = "user-contributed-activity",
                Title = "User contribution",
                Description = "Stays untouched across seeds.",
                BodyArea = BodyArea.Core,
                Intensity = IntensityLevel.Low,
                DurationSeconds = 30,
                EquipmentTags = [],
                AnimationProvider = "local",
                AnimationAssetId = "user-contributed",
            });
            await db.SaveChangesAsync();
        }

        var seeder = ActivatorUtilities.CreateInstance<ActivityCatalogSeeder>(factory.Services);
        await seeder.StartAsync(CancellationToken.None);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
            var survivor = await db.Activities.SingleOrDefaultAsync(a => a.Slug == "user-contributed-activity");
            Assert.NotNull(survivor);
        }
    }

    private static async Task ClearActivitiesAsync(AuthWebAppFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        await db.Activities.ExecuteDeleteAsync();
    }

    private static async Task<(IReadOnlyList<ActivityDefinition> Catalog, List<Activity> Persisted)> ReadAsync(
        AuthWebAppFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var provider = scope.ServiceProvider.GetRequiredService<IActivityCatalogProvider>();
        var catalog = await provider.GetCatalogAsync(CancellationToken.None);
        var persisted = await db.Activities.ToListAsync();
        return (catalog, persisted);
    }
}
