// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Devngn.Wellness.Api.Catalog;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Catalog;

/// <summary>
/// Integration tests for <c>GET /v1/activities</c>. The seeder runs as a hosted
/// service when the factory starts, so each test inherits a fully populated
/// catalog and only needs to assert filter semantics. Tests that depend on a
/// specific row count call <c>ClearActivitiesAsync</c> + reseed deterministically
/// to avoid cross-test bleed-through.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class ActivityEndpointTests(PostgresContainerFixture postgres)
{
    /// <summary>
    /// The API serialises enums as string names (see <c>ConfigureHttpJsonOptions</c>
    /// in <c>Program.cs</c>). The test client has to mirror that, otherwise
    /// <see cref="HttpContentJsonExtensions.ReadFromJsonAsync"/> will fail to
    /// rebind <c>"Breath"</c> into <see cref="BodyArea"/>.
    /// </summary>
    private static readonly JsonSerializerOptions ClientJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };
    [Fact]
    public async Task Get_without_auth_returns_401()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/v1/activities");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_returns_seeded_catalog_when_no_filter_applied()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync("/v1/activities");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.NotEmpty(rows!);
        // Default sort is (DurationSeconds, Slug). Verify monotonic ordering.
        for (var i = 1; i < rows!.Count; i++)
        {
            Assert.True(
                rows[i - 1].DurationSeconds < rows[i].DurationSeconds
                || (rows[i - 1].DurationSeconds == rows[i].DurationSeconds
                    && string.CompareOrdinal(rows[i - 1].Slug, rows[i].Slug) <= 0),
                $"Out of order at {i}: {rows[i - 1].Slug} then {rows[i].Slug}");
        }
    }

    [Fact]
    public async Task Endpoint_does_not_require_consent()
    {
        // Catalog is reference data, not personal. A bearer without consent must succeed.
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync("/v1/activities");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Get_filters_by_body_area()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/activities?bodyArea=Breath");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.NotEmpty(rows!);
        Assert.All(rows!, r => Assert.Equal(BodyArea.Breath, r.BodyArea));
    }

    [Fact]
    public async Task Get_filters_by_max_duration()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/activities?maxDurationSeconds=30");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.NotEmpty(rows!);
        Assert.All(rows!, r => Assert.True(r.DurationSeconds <= 30));
    }

    [Fact]
    public async Task Get_with_non_positive_max_duration_returns_400()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync("/v1/activities?maxDurationSeconds=0");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_with_unknown_body_area_returns_400()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync("/v1/activities?bodyArea=NotARealArea");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Available_equipment_filter_uses_subset_semantics()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // User has only a mat → matches empty-tag activities + mat-only activities,
        // but never the bands-light or chair-only entries.
        var response = await client.GetAsync("/v1/activities?availableEquipmentTag=mat");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.NotEmpty(rows!);
        Assert.All(rows!, r =>
        {
            foreach (var tag in r.EquipmentTags)
            {
                Assert.Equal("mat", tag);
            }
        });
        // The all-no-equipment subset must be present (e.g., shoulder-rolls).
        Assert.Contains(rows!, r => r.Slug == "shoulder-rolls");
        // A mat-tagged activity must be present.
        Assert.Contains(rows!, r => r.EquipmentTags.Contains("mat"));
        // A bands-light activity must NOT be present.
        Assert.DoesNotContain(rows!, r => r.EquipmentTags.Contains("bands-light"));
    }

    [Fact]
    public async Task Available_equipment_filter_with_multiple_tags_is_unioned()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // Caller has mat AND bands-light: subset semantics let either mat-only or
        // bands-light-only activities through.
        var response = await client.GetAsync("/v1/activities?availableEquipmentTag=mat&availableEquipmentTag=bands-light");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.Contains(rows!, r => r.EquipmentTags.Contains("mat"));
        Assert.Contains(rows!, r => r.EquipmentTags.Contains("bands-light"));
        Assert.DoesNotContain(rows!, r => r.EquipmentTags.Contains("chair-only"));
    }

    [Fact]
    public async Task Available_equipment_filter_normalises_casing_and_whitespace()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/activities?availableEquipmentTag=%20MAT%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.Contains(rows!, r => r.EquipmentTags.Contains("mat"));
    }

    [Fact]
    public async Task Combined_filter_intersects_predicates()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        await ReseedAsync(factory);
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync(
            "/v1/activities?bodyArea=Breath&maxDurationSeconds=60");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.All(rows!, r =>
        {
            Assert.Equal(BodyArea.Breath, r.BodyArea);
            Assert.True(r.DurationSeconds <= 60);
        });
    }

    private static async Task ReseedAsync(AuthWebAppFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        // Prompts reference activities with a restrict FK, so clear any prompt detritus
        // left on the shared container by prompt-delivery tests before wiping the catalog.
        await db.Prompts.ExecuteDeleteAsync();
        await db.Activities.ExecuteDeleteAsync();
        var seeder = ActivatorUtilities.CreateInstance<ActivityCatalogSeeder>(factory.Services);
        await seeder.StartAsync(CancellationToken.None);
    }
}
