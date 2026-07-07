// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Gamification;

/// <summary>
/// Endpoint auth tests for the gamification group (<c>/v1/gamification/*</c>).
/// Verifies 401 when anonymous, 403 when authenticated but without consent, and that
/// the leaderboard respects the <c>SocialProfile.IsPublic</c> flag.
/// Requires Docker/Postgres.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GamificationAuthTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    // -------------------------------------------------------------------------
    // 401 — anonymous requests are rejected on every gamification endpoint
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData("GET",  "/v1/gamification/me")]
    [InlineData("GET",  "/v1/gamification/badges")]
    [InlineData("GET",  "/v1/gamification/milestones")]
    [InlineData("GET",  "/v1/gamification/leaderboard")]
    public async Task Gamification_AnonymousRequest_Returns401(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // -------------------------------------------------------------------------
    // 403 — authenticated but no consent
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData("/v1/gamification/me")]
    [InlineData("/v1/gamification/badges")]
    [InlineData("/v1/gamification/milestones")]
    [InlineData("/v1/gamification/leaderboard")]
    public async Task Gamification_AuthenticatedNoConsent_Returns403(string path)
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // -------------------------------------------------------------------------
    // Leaderboard respects IsPublic — private players are excluded
    // -------------------------------------------------------------------------

    [Fact]
    public async Task Leaderboard_ExcludesPlayersWithPrivateProfile()
    {
        using var factory = Factory();

        var publicPlayer = await factory.SeedAuthenticatedUserAsync();
        using var publicClient = factory.CreateClientWithBearer(publicPlayer.Token);
        await publicClient.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Public Leaderboard Player",
            isPublic = true,
        });

        var privatePlayer = await factory.SeedAuthenticatedUserAsync();
        using var privateClient = factory.CreateClientWithBearer(privatePlayer.Token);
        await privateClient.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Private Leaderboard Player",
            isPublic = false,
        });

        var leaderboard = await publicClient
            .GetFromJsonAsync<List<LeaderboardEntryAuthDto>>("/v1/gamification/leaderboard");
        Assert.NotNull(leaderboard);
        Assert.DoesNotContain(leaderboard!, e => e.DisplayName == "Private Leaderboard Player");
    }

    // -------------------------------------------------------------------------
    // Leaderboard respects IsPublic — public players appear
    // -------------------------------------------------------------------------

    [Fact]
    public async Task Leaderboard_IncludesPlayersWithPublicProfile()
    {
        using var factory = Factory();

        var player = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(player.Token);

        // Create player state (required for the leaderboard JOIN) by hitting the
        // /me endpoint, then set up the public social profile.
        await client.GetAsync("/v1/gamification/me");
        await client.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Visible Player",
            isPublic = true,
        });

        var leaderboard = await client
            .GetFromJsonAsync<List<LeaderboardEntryAuthDto>>("/v1/gamification/leaderboard");
        Assert.NotNull(leaderboard);
        Assert.Contains(leaderboard!, e => e.DisplayName == "Visible Player");
    }

    private sealed record LeaderboardEntryAuthDto(Guid UserId, string DisplayName, int TotalXp, int Level, string RankTier);
}
