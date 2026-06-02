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
public sealed class GoalEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task Goals_full_lifecycle_round_trips()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var create = await client.PostAsJsonAsync("/v1/goals", new
        {
            title = "10 mobility breaks/day",
            description = "Posture + neck",
            category = "Mobility",
            targetMetric = "10/day",
            startDate = "2026-06-01",
            endDate = "2026-12-31",
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<GoalDto>();
        Assert.NotNull(created);

        var list = await client.GetFromJsonAsync<List<GoalDto>>("/v1/goals");
        Assert.NotNull(list);
        Assert.Contains(list!, g => g.Id == created!.Id);

        var fetched = await client.GetFromJsonAsync<GoalDto>($"/v1/goals/{created!.Id}");
        Assert.Equal("10 mobility breaks/day", fetched?.Title);

        var update = await client.PutAsJsonAsync($"/v1/goals/{created.Id}", new
        {
            title = "12 mobility breaks/day",
            category = "Mobility",
            startDate = "2026-06-01",
        });
        update.EnsureSuccessStatusCode();
        var updated = await update.Content.ReadFromJsonAsync<GoalDto>();
        Assert.Equal("12 mobility breaks/day", updated?.Title);
        Assert.Null(updated?.EndDate);

        var del = await client.DeleteAsync($"/v1/goals/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var afterDelete = await client.GetAsync($"/v1/goals/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, afterDelete.StatusCode);
    }

    [Fact]
    public async Task Other_users_goal_id_returns_404_not_403()
    {
        using var factory = Factory();
        var alice = await factory.SeedAuthenticatedUserAsync();
        var bob = await factory.SeedAuthenticatedUserAsync();
        using var aliceClient = factory.CreateClientWithBearer(alice.Token);
        using var bobClient = factory.CreateClientWithBearer(bob.Token);

        var created = await (await aliceClient.PostAsJsonAsync("/v1/goals", new
        {
            title = "Alice goal",
            category = "Posture",
            startDate = "2026-06-01",
        })).Content.ReadFromJsonAsync<GoalDto>();

        var response = await bobClient.GetAsync($"/v1/goals/{created!.Id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Create_goal_with_blank_title_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/goals", new
        {
            title = "",
            category = "Posture",
            startDate = "2026-06-01",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_goal_with_end_before_start_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/goals", new
        {
            title = "Backwards",
            category = "Posture",
            startDate = "2026-06-02",
            endDate = "2026-06-01",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_goal_with_unknown_category_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/goals", new
        {
            title = "Bad enum",
            category = "BalrogSlaying",
            startDate = "2026-06-01",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private sealed record GoalDto(
        Guid Id,
        string Title,
        string? Description,
        string Category,
        string? TargetMetric,
        DateOnly StartDate,
        DateOnly? EndDate,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt);
}
