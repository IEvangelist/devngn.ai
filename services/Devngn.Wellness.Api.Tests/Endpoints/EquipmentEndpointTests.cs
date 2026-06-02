// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Integration;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Endpoints;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class EquipmentEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task Equipment_full_lifecycle_round_trips()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var create = await client.PostAsJsonAsync("/v1/equipment", new
        {
            tag = "bands-light",
            displayName = "Light resistance bands",
            notes = "Set of 3",
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<EquipmentDto>();

        var update = await client.PutAsJsonAsync($"/v1/equipment/{created!.Id}", new
        {
            displayName = "Light bands (renamed)",
            notes = "Updated",
        });
        update.EnsureSuccessStatusCode();
        var updated = await update.Content.ReadFromJsonAsync<EquipmentDto>();
        Assert.Equal("Light bands (renamed)", updated?.DisplayName);
        // Tag is the stable identifier the catalog matcher keys off; PUT must not change it.
        Assert.Equal("bands-light", updated?.Tag);

        var del = await client.DeleteAsync($"/v1/equipment/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
    }

    [Fact]
    public async Task Create_equipment_with_invalid_tag_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/equipment", new
        {
            tag = "Yoga Mat!",
            displayName = "Yoga mat",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Duplicate_tag_for_same_user_is_409()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        (await client.PostAsJsonAsync("/v1/equipment", new { tag = "mat", displayName = "Yoga mat" }))
            .EnsureSuccessStatusCode();

        var dup = await client.PostAsJsonAsync("/v1/equipment", new { tag = "mat", displayName = "Other mat" });

        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
    }

    [Fact]
    public async Task Same_tag_for_different_users_is_allowed()
    {
        using var factory = Factory();
        var alice = await factory.SeedAuthenticatedUserAsync();
        var bob = await factory.SeedAuthenticatedUserAsync();
        using var aliceClient = factory.CreateClientWithBearer(alice.Token);
        using var bobClient = factory.CreateClientWithBearer(bob.Token);

        (await aliceClient.PostAsJsonAsync("/v1/equipment", new { tag = "mat", displayName = "Alice mat" }))
            .EnsureSuccessStatusCode();
        var bobCreate = await bobClient.PostAsJsonAsync("/v1/equipment", new { tag = "mat", displayName = "Bob mat" });

        Assert.Equal(HttpStatusCode.Created, bobCreate.StatusCode);
    }

    [Fact]
    public async Task Equipment_without_consent_is_403()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/equipment", new { tag = "mat", displayName = "Yoga mat" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private sealed record EquipmentDto(
        Guid Id,
        string Tag,
        string DisplayName,
        string? Notes,
        DateTimeOffset CreatedAt);
}
