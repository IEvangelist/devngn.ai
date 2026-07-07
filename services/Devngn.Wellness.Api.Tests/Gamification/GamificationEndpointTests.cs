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
/// Integration tests for gamification endpoints. Verifies that
/// <c>GET /v1/gamification/me</c>, badges, and milestones return well-formed responses.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class GamificationEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task GetPlayerState_returns_initial_state()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/gamification/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<PlayerStateDto>();
        Assert.NotNull(body);
        // New user starts at level 1, zero XP, no streak.
        Assert.Equal(1, body!.Level);
        Assert.Equal(0, body.TotalXp);
        Assert.Equal(0, body.CurrentStreak);
    }

    [Fact]
    public async Task ListBadges_returns_full_list_with_hidden_anonymized()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/gamification/badges");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var badges = await response.Content.ReadFromJsonAsync<List<BadgeDto>>();
        Assert.NotNull(badges);
        Assert.NotEmpty(badges!);

        // Hidden unearned badges should be anonymized.
        var hiddenUnearned = badges.Where(b => b.IsHidden && !b.Earned).ToList();
        Assert.All(hiddenUnearned, b =>
        {
            Assert.Equal("???", b.Name);
            Assert.Equal("🔒", b.Icon);
        });
    }

    [Fact]
    public async Task ListMilestones_returns_list()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync("/v1/gamification/milestones");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var milestones = await response.Content.ReadFromJsonAsync<List<MilestoneDto>>();
        Assert.NotNull(milestones);
    }

    [Fact]
    public async Task Leaderboard_returns_only_public_players()
    {
        using var factory = Factory();

        // Seed a public player.
        var publicPlayer = await factory.SeedAuthenticatedUserAsync();
        var publicClient = factory.CreateClientWithBearer(publicPlayer.Token);
        await publicClient.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Public Player",
            isPublic = true,
        });

        // Seed a private player.
        var privatePlayer = await factory.SeedAuthenticatedUserAsync();
        var privateClient = factory.CreateClientWithBearer(privatePlayer.Token);
        await privateClient.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Private Player",
            isPublic = false,
        });

        var leaderboard = await publicClient.GetFromJsonAsync<List<LeaderboardEntryDto>>("/v1/gamification/leaderboard");
        Assert.NotNull(leaderboard);
        Assert.DoesNotContain(leaderboard!, e => e.DisplayName == "Private Player");
    }

    private sealed record PlayerStateDto(int Level, int TotalXp, int XpIntoLevel, int XpForNextLevel, int CurrentStreak, int LongestStreak, string RankTier);
    private sealed record BadgeDto(string Key, string Name, string Description, string Icon, string Category, bool IsHidden, bool Earned, DateTimeOffset? EarnedAt);
    private sealed record MilestoneDto(string Key, string Name, string Description, bool IsHidden, bool Achieved, DateTimeOffset? AchievedAt);
    private sealed record LeaderboardEntryDto(Guid UserId, string DisplayName, int TotalXp, int Level, string RankTier);
}
