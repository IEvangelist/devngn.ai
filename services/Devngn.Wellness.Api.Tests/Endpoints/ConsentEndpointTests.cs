// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Endpoints;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class ConsentEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task Get_consent_without_bearer_is_401()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/consent");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_consent_for_user_without_acceptance_returns_current_only()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var body = await client.GetFromJsonAsync<ConsentStateDto>("/v1/consent");

        Assert.NotNull(body);
        Assert.Null(body!.Accepted);
        Assert.Equal("1.0", body.Current.Version);
        Assert.False(string.IsNullOrWhiteSpace(body.Current.Text));
    }

    [Fact]
    public async Task Post_consent_with_unknown_version_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/consent", new { version = "9.9-nope" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Post_consent_accepts_canonical_text_from_registry()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PostAsJsonAsync("/v1/consent", new { version = "1.0", text = "client-supplied lies" });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<ConsentSnapshotDto>();
        Assert.NotNull(body);
        Assert.Equal("1.0", body!.Version);
        // Server uses the canonical registry text, never the client's payload.
        Assert.DoesNotContain("lies", body.Text);
    }

    [Fact]
    public async Task Post_consent_is_idempotent_for_same_version()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var first = await (await client.PostAsJsonAsync("/v1/consent", new { version = "1.0" }))
            .Content.ReadFromJsonAsync<ConsentSnapshotDto>();
        await Task.Delay(50);
        var second = await (await client.PostAsJsonAsync("/v1/consent", new { version = "1.0" }))
            .Content.ReadFromJsonAsync<ConsentSnapshotDto>();

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(first!.AcceptedAt, second!.AcceptedAt);
    }

    [Fact]
    public async Task Delete_consent_cascades_to_profile_goals_and_equipment()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // Seed profile + goal + equipment via endpoints to exercise the full path.
        (await client.PutAsJsonAsync("/v1/profile", new { fitnessBaseline = "Moderate", preferredIntensity = "Low" }))
            .EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/v1/goals", new
        {
            title = "Mobility",
            category = "Mobility",
            startDate = "2026-06-01",
        })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/v1/equipment", new
        {
            tag = "mat",
            displayName = "Yoga mat",
        })).EnsureSuccessStatusCode();

        var revoke = await client.DeleteAsync("/v1/consent");
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        Assert.NotNull(await db.Users.SingleOrDefaultAsync(u => u.Id == seeded.Id));
        Assert.False(await db.ConsentRecords.AnyAsync(c => c.UserId == seeded.Id));
        Assert.False(await db.Profiles.AnyAsync(p => p.UserId == seeded.Id));
        Assert.False(await db.Goals.AnyAsync(g => g.UserId == seeded.Id));
        Assert.False(await db.Equipment.AnyAsync(e => e.UserId == seeded.Id));
    }

    [Fact]
    public async Task Delete_consent_when_none_present_is_still_204()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.DeleteAsync("/v1/consent");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private sealed record ConsentStateDto(ConsentSnapshotDto? Accepted, CurrentTextDto Current);
    private sealed record ConsentSnapshotDto(string Version, string Text, DateTimeOffset AcceptedAt);
    private sealed record CurrentTextDto(string Version, string Text);
}
