// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace Devngn.Wellness.Client.Tests;

public sealed class WellnessClientTests
{
    private const string ProfileJson =
        """
        {"id":"11111111-1111-1111-1111-111111111111","ageRange":"30-39","heightCm":180.5,"weightKg":80.2,"fitnessBaseline":"Active","preferredIntensity":"Medium","limitations":null,"timeOfDayPreference":"morning","updatedAt":"2026-06-02T10:00:00+00:00"}
        """;

    private const string GoalJson =
        """
        {"id":"22222222-2222-2222-2222-222222222222","title":"Stretch","description":null,"category":"Mobility","targetMetric":null,"startDate":"2026-06-02","endDate":null,"createdAt":"2026-06-02T10:00:00+00:00","updatedAt":"2026-06-02T10:00:00+00:00"}
        """;

    private const string EquipmentJson =
        """
        {"id":"33333333-3333-3333-3333-333333333333","tag":"mat","displayName":"Mat","notes":null,"createdAt":"2026-06-02T10:00:00+00:00"}
        """;

    [Fact]
    public async Task GetProfile_deserializes_payload_and_sends_bearer_token()
    {
        using var harness = TestHarness.Build(o => o.AccessTokenProvider = _ => new ValueTask<string?>("tok-123"));
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, ProfileJson);

        var profile = await harness.Client.GetProfileAsync(CancellationToken.None);

        Assert.NotNull(profile);
        Assert.Equal(FitnessBaseline.Active, profile!.FitnessBaseline);
        Assert.Equal(IntensityLevel.Medium, profile.PreferredIntensity);
        Assert.Equal(180.5m, profile.HeightCm);
        Assert.Equal(80.2m, profile.WeightKg);

        var recorded = Assert.Single(harness.Stub.Requests);
        Assert.Equal("Bearer tok-123", recorded.Authorization);
        Assert.Equal("/v1/profile", recorded.Uri.AbsolutePath);
    }

    [Fact]
    public async Task No_token_provider_sends_no_authorization_header()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.ListGoalsAsync(CancellationToken.None);

        Assert.Null(Assert.Single(harness.Stub.Requests).Authorization);
    }

    [Fact]
    public async Task ListActivities_unfiltered_is_cached_across_calls()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.ListActivitiesAsync(cancellationToken: CancellationToken.None);
        await harness.Client.ListActivitiesAsync(cancellationToken: CancellationToken.None);

        Assert.Equal(1, harness.Stub.CountRequests(HttpMethod.Get, "/v1/activities"));
    }

    [Fact]
    public async Task ListActivities_filtered_bypasses_cache_and_builds_query()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.ListActivitiesAsync(["mat", "bands-light"], BodyArea.Upper, 60, CancellationToken.None);
        await harness.Client.ListActivitiesAsync(["mat", "bands-light"], BodyArea.Upper, 60, CancellationToken.None);

        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/activities"));

        var query = harness.Stub.Requests[0].Uri.PathAndQuery;
        Assert.Contains("availableEquipmentTag=mat", query, StringComparison.Ordinal);
        Assert.Contains("availableEquipmentTag=bands-light", query, StringComparison.Ordinal);
        Assert.Contains("bodyArea=Upper", query, StringComparison.Ordinal);
        Assert.Contains("maxDurationSeconds=60", query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Equipment_list_is_cached_per_scope_and_invalidated_on_add()
    {
        using var harness = TestHarness.Build(o => o.CacheScopeProvider = _ => new ValueTask<string?>("user-1"));
        harness.Stub.Responder = (req, _) => req.Method == HttpMethod.Post
            ? new StubResponse(HttpStatusCode.Created, EquipmentJson)
            : new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        Assert.Equal(1, harness.Stub.CountRequests(HttpMethod.Get, "/v1/equipment"));

        await harness.Client.AddEquipmentAsync(
            new CreateEquipmentRequest { Tag = "mat", DisplayName = "Mat" }, CancellationToken.None);

        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/equipment"));
    }

    [Fact]
    public async Task Equipment_list_is_not_cached_without_a_scope()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        await harness.Client.ListEquipmentAsync(CancellationToken.None);

        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/equipment"));
    }

    [Fact]
    public async Task Profile_is_cached_per_scope_and_invalidated_on_upsert()
    {
        using var harness = TestHarness.Build(o => o.CacheScopeProvider = _ => new ValueTask<string?>("user-1"));
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, ProfileJson);

        await harness.Client.GetProfileAsync(CancellationToken.None);
        await harness.Client.GetProfileAsync(CancellationToken.None);
        Assert.Equal(1, harness.Stub.CountRequests(HttpMethod.Get, "/v1/profile"));

        await harness.Client.UpsertProfileAsync(new UpsertProfileRequest(), CancellationToken.None);

        await harness.Client.GetProfileAsync(CancellationToken.None);
        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/profile"));
    }

    [Fact]
    public async Task GetProfile_returns_null_on_404()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.NotFound, null);

        Assert.Null(await harness.Client.GetProfileAsync(CancellationToken.None));
    }

    [Fact]
    public async Task GetGoal_returns_null_on_404()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.NotFound, null);

        Assert.Null(await harness.Client.GetGoalAsync(Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task RequestNextPrompt_returns_null_on_204_and_sends_channel_query()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.NoContent, null);

        var prompt = await harness.Client.RequestNextPromptAsync(channel: DeliveryChannel.Cli, cancellationToken: CancellationToken.None);

        Assert.Null(prompt);
        var query = harness.Stub.Requests[0].Uri.PathAndQuery;
        Assert.Contains("/v1/prompts/next", query, StringComparison.Ordinal);
        Assert.Contains("channel=Cli", query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task NonSuccess_response_throws_WellnessApiException_with_body()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.Forbidden, """{"title":"consent_required"}""");

        var ex = await Assert.ThrowsAsync<WellnessApiException>(() => harness.Client.GetConsentAsync(CancellationToken.None));

        Assert.Equal(HttpStatusCode.Forbidden, ex.StatusCode);
        Assert.Contains("consent_required", ex.ResponseBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CreateGoal_serializes_enum_as_string_and_dateonly_as_iso()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.Created, GoalJson);

        await harness.Client.CreateGoalAsync(
            new CreateGoalRequest
            {
                Title = "Stretch",
                Category = GoalCategory.Mobility,
                StartDate = new DateOnly(2026, 6, 2),
            },
            CancellationToken.None);

        var body = harness.Stub.Requests[0].Body!;
        Assert.Contains("\"title\":\"Stretch\"", body, StringComparison.Ordinal);
        Assert.Contains("\"category\":\"Mobility\"", body, StringComparison.Ordinal);
        Assert.Contains("\"startDate\":\"2026-06-02\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ListGaps_formats_query_with_invariant_round_trip_values()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, "[]");

        var from = new DateTimeOffset(2026, 6, 2, 9, 0, 0, TimeSpan.Zero);
        var to = new DateTimeOffset(2026, 6, 2, 17, 0, 0, TimeSpan.Zero);
        await harness.Client.ListGapsAsync(from, to, "America/New_York", CancellationToken.None);

        var query = Uri.UnescapeDataString(harness.Stub.Requests[0].Uri.PathAndQuery);
        Assert.Contains("from=2026-06-02T09:00:00.0000000+00:00", query, StringComparison.Ordinal);
        Assert.Contains("to=2026-06-02T17:00:00.0000000+00:00", query, StringComparison.Ordinal);
        Assert.Contains("tz=America/New_York", query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SyncScheduleSource_parses_synced_count()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(HttpStatusCode.OK, """{"synced":7}""");

        var result = await harness.Client.SyncScheduleSourceAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(7, result.Synced);
    }

    [Fact]
    public async Task PushScheduleEvents_round_trips_items_and_returns_persisted_events()
    {
        using var harness = TestHarness.Build();
        harness.Stub.Responder = (_, _) => new StubResponse(
            HttpStatusCode.OK,
            """
            [{"id":"44444444-4444-4444-4444-444444444444","sourceId":"55555555-5555-5555-5555-555555555555","externalId":"evt-1","startUtc":"2026-06-02T09:00:00+00:00","endUtc":"2026-06-02T09:30:00+00:00","busy":true}]
            """);

        var sourceId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var result = await harness.Client.PushScheduleEventsAsync(
            new PushScheduleEventsRequest
            {
                SourceId = sourceId,
                Items =
                [
                    new PushScheduleEventItem
                    {
                        ExternalId = "evt-1",
                        StartUtc = new DateTimeOffset(2026, 6, 2, 9, 0, 0, TimeSpan.Zero),
                        EndUtc = new DateTimeOffset(2026, 6, 2, 9, 30, 0, TimeSpan.Zero),
                    },
                ],
            },
            CancellationToken.None);

        var persisted = Assert.Single(result);
        Assert.Equal("evt-1", persisted.ExternalId);
        Assert.Equal(sourceId, persisted.SourceId);

        var body = harness.Stub.Requests[0].Body!;
        Assert.Contains("\"sourceId\":\"55555555-5555-5555-5555-555555555555\"", body, StringComparison.Ordinal);
        Assert.Contains("\"externalId\":\"evt-1\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RevokeConsent_invalidates_scoped_profile_and_equipment_caches()
    {
        using var harness = TestHarness.Build(o => o.CacheScopeProvider = _ => new ValueTask<string?>("user-1"));
        harness.Stub.Responder = (req, _) => req.Method == HttpMethod.Delete
            ? new StubResponse(HttpStatusCode.NoContent, null)
            : req.Method == HttpMethod.Get && req.RequestUri!.AbsolutePath.EndsWith("/profile", StringComparison.Ordinal)
                ? new StubResponse(HttpStatusCode.OK, ProfileJson)
                : new StubResponse(HttpStatusCode.OK, "[]");

        await harness.Client.GetProfileAsync(CancellationToken.None);
        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        Assert.Equal(1, harness.Stub.CountRequests(HttpMethod.Get, "/v1/profile"));
        Assert.Equal(1, harness.Stub.CountRequests(HttpMethod.Get, "/v1/equipment"));

        await harness.Client.RevokeConsentAsync(CancellationToken.None);

        await harness.Client.GetProfileAsync(CancellationToken.None);
        await harness.Client.ListEquipmentAsync(CancellationToken.None);
        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/profile"));
        Assert.Equal(2, harness.Stub.CountRequests(HttpMethod.Get, "/v1/equipment"));
    }

    [Fact]
    public void Missing_base_address_fails_options_validation()
    {
        var services = new ServiceCollection();
        services.AddWellnessClient(o => o.ConfigureResilience = false);
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IWellnessClient>());
    }
}
