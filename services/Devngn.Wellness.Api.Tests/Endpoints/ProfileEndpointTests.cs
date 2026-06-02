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
public sealed class ProfileEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task Get_profile_without_bearer_is_401()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/v1/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_profile_without_consent_is_403_consent_required()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/profile");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorBody>();
        Assert.Equal("consent_required", body?.Error);
    }

    [Fact]
    public async Task Get_profile_when_not_set_returns_404()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/profile");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Put_profile_creates_then_replaces_state()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var create = await client.PutAsJsonAsync("/v1/profile", new
        {
            ageRange = "30-39",
            heightCm = 178.5m,
            weightKg = 81.25m,
            fitnessBaseline = "Moderate",
            preferredIntensity = "Medium",
            limitations = "low-impact knees",
            timeOfDayPreference = "morning",
        });
        create.EnsureSuccessStatusCode();

        // True-PUT: omitted nullable fields are wiped.
        var replace = await client.PutAsJsonAsync("/v1/profile", new
        {
            fitnessBaseline = "Light",
            preferredIntensity = "Low",
        });
        replace.EnsureSuccessStatusCode();
        var body = await replace.Content.ReadFromJsonAsync<ProfileDto>();
        Assert.NotNull(body);
        Assert.Null(body!.AgeRange);
        Assert.Null(body.HeightCm);
        Assert.Null(body.WeightKg);
        Assert.Null(body.Limitations);
        Assert.Null(body.TimeOfDayPreference);
        Assert.Equal("Light", body.FitnessBaseline);
    }

    [Fact]
    public async Task Put_profile_with_invalid_height_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PutAsJsonAsync("/v1/profile", new
        {
            heightCm = 9999m,
            fitnessBaseline = "Light",
            preferredIntensity = "Low",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Delete_profile_returns_204_when_present_and_404_when_not()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var initialDelete = await client.DeleteAsync("/v1/profile");
        Assert.Equal(HttpStatusCode.NotFound, initialDelete.StatusCode);

        (await client.PutAsJsonAsync("/v1/profile", new { fitnessBaseline = "Light", preferredIntensity = "Low" }))
            .EnsureSuccessStatusCode();

        var realDelete = await client.DeleteAsync("/v1/profile");
        Assert.Equal(HttpStatusCode.NoContent, realDelete.StatusCode);
    }

    private sealed record ErrorBody(string? Error);

    private sealed record ProfileDto(
        Guid Id,
        string? AgeRange,
        decimal? HeightCm,
        decimal? WeightKg,
        string FitnessBaseline,
        string PreferredIntensity,
        string? Limitations,
        string? TimeOfDayPreference,
        DateTimeOffset UpdatedAt);
}
