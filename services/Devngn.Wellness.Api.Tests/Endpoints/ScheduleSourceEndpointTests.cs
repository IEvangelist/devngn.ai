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
public sealed class ScheduleSourceEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task User_source_full_lifecycle_round_trips()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var create = await client.PostAsJsonAsync("/v1/schedule/sources", new
        {
            type = "User",
            displayName = "Local push from CLI",
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ScheduleSourceDto>();
        Assert.NotNull(created);
        Assert.Equal("User", created!.Type);
        Assert.Equal("Connected", created.ConnectionStatus);

        var list = await client.GetFromJsonAsync<List<ScheduleSourceDto>>("/v1/schedule/sources");
        Assert.NotNull(list);
        Assert.Contains(list!, s => s.Id == created.Id);

        var patch = await client.PatchAsJsonAsync($"/v1/schedule/sources/{created.Id}", new
        {
            displayName = "Renamed local source",
            connectionStatus = "Disabled",
        });
        patch.EnsureSuccessStatusCode();
        var patched = await patch.Content.ReadFromJsonAsync<ScheduleSourceDto>();
        Assert.Equal("Renamed local source", patched?.DisplayName);
        Assert.Equal("Disabled", patched?.ConnectionStatus);

        var del = await client.DeleteAsync($"/v1/schedule/sources/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
    }

    [Fact]
    public async Task POST_with_Google_type_is_rejected()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // Google/Microsoft sources are created via the OAuth connect flow in 7b/7c.
        // Allowing a bare POST here would create a source row with no refresh token.
        var response = await client.PostAsJsonAsync("/v1/schedule/sources", new
        {
            type = "Google",
            displayName = "Work calendar",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Source_without_consent_is_403()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/schedule/sources", new
        {
            type = "User",
            displayName = "X",
        });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PATCH_to_NeedsReconnect_is_rejected()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var create = await client.PostAsJsonAsync("/v1/schedule/sources", new { type = "User", displayName = "S" });
        var dto = await create.Content.ReadFromJsonAsync<ScheduleSourceDto>();

        // Only Connected/Disabled are user-settable; NeedsReconnect/Error/PendingConnection
        // are pipeline-managed transitions.
        var response = await client.PatchAsJsonAsync($"/v1/schedule/sources/{dto!.Id}", new
        {
            connectionStatus = "NeedsReconnect",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Cross_user_GET_returns_404()
    {
        using var factory = Factory();
        var alice = await factory.SeedAuthenticatedUserAsync();
        var bob = await factory.SeedAuthenticatedUserAsync();
        using var aliceClient = factory.CreateClientWithBearer(alice.Token);
        using var bobClient = factory.CreateClientWithBearer(bob.Token);

        var create = await aliceClient.PostAsJsonAsync("/v1/schedule/sources", new { type = "User", displayName = "Alice" });
        var dto = await create.Content.ReadFromJsonAsync<ScheduleSourceDto>();

        var response = await bobClient.GetAsync($"/v1/schedule/sources/{dto!.Id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    internal sealed record ScheduleSourceDto(
        Guid Id,
        string Type,
        string DisplayName,
        string ConnectionStatus,
        string? Scope,
        DateTimeOffset? LastSyncAt,
        DateTimeOffset? LastRefreshAt,
        string? LastSyncErrorCode,
        DateTimeOffset? LastSyncErrorAt,
        DateTimeOffset CreatedAt);
}
