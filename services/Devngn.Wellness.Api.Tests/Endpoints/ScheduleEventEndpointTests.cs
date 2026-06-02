// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Integration;
using Xunit;
using SourceDto = Devngn.Wellness.Api.Tests.Endpoints.ScheduleSourceEndpointTests.ScheduleSourceDto;

namespace Devngn.Wellness.Api.Tests.Endpoints;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class ScheduleEventEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    [Fact]
    public async Task Push_and_list_round_trips_with_externalId_idempotency()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var source = await CreateUserSourceAsync(client);

        var start = DateTimeOffset.UtcNow.AddMinutes(10);
        var end = start.AddMinutes(30);

        var firstPush = await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source.Id,
            items = new[]
            {
                new { externalId = "evt-1", startUtc = start, endUtc = end, busy = true },
            },
        });
        firstPush.EnsureSuccessStatusCode();

        // Same externalId on retry must upsert, not duplicate. The (SourceId, ExternalId)
        // unique index plus the upsert pre-lookup is what guarantees idempotency.
        var secondPush = await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source.Id,
            items = new[]
            {
                new { externalId = "evt-1", startUtc = start.AddMinutes(5), endUtc = end.AddMinutes(5), busy = false },
            },
        });
        secondPush.EnsureSuccessStatusCode();

        var list = await client.GetFromJsonAsync<List<ScheduleEventDto>>(
            $"/v1/schedule/events?from={Uri.EscapeDataString(start.AddMinutes(-5).ToString("O"))}&to={Uri.EscapeDataString(end.AddMinutes(15).ToString("O"))}");
        Assert.NotNull(list);
        Assert.Single(list!);
        Assert.False(list![0].Busy);
        Assert.Equal(start.AddMinutes(5), list[0].StartUtc, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Push_with_start_after_end_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var source = await CreateUserSourceAsync(client);

        var t = DateTimeOffset.UtcNow.AddMinutes(10);
        var response = await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source.Id,
            items = new[] { new { externalId = "bad", startUtc = t.AddMinutes(30), endUtc = t, busy = true } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Push_to_disabled_source_is_409()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var source = await CreateUserSourceAsync(client);

        var disable = await client.PatchAsJsonAsync($"/v1/schedule/sources/{source.Id}", new { connectionStatus = "Disabled" });
        disable.EnsureSuccessStatusCode();

        var t = DateTimeOffset.UtcNow.AddMinutes(10);
        var response = await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source.Id,
            items = new[] { new { externalId = "evt", startUtc = t, endUtc = t.AddMinutes(15), busy = true } },
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Query_window_over_30_days_is_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var from = DateTimeOffset.UtcNow;
        var to = from.AddDays(31);
        var response = await client.GetAsync(
            $"/v1/schedule/events?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Cross_user_source_push_is_404()
    {
        using var factory = Factory();
        var alice = await factory.SeedAuthenticatedUserAsync();
        var bob = await factory.SeedAuthenticatedUserAsync();
        using var aliceClient = factory.CreateClientWithBearer(alice.Token);
        using var bobClient = factory.CreateClientWithBearer(bob.Token);

        var aliceSource = await CreateUserSourceAsync(aliceClient);

        var t = DateTimeOffset.UtcNow.AddMinutes(10);
        var response = await bobClient.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = aliceSource.Id,
            items = new[] { new { externalId = "evt", startUtc = t, endUtc = t.AddMinutes(15), busy = true } },
        });

        // The owner-scoped query in PushAsync filters by both Id and UserId, so Bob
        // gets a clean 404 rather than a 5xx FK violation. The composite FK is the
        // belt-and-braces backstop.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_source_cascades_to_events()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var source = await CreateUserSourceAsync(client);

        var t = DateTimeOffset.UtcNow.AddMinutes(10);
        await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source.Id,
            items = new[] { new { externalId = "evt", startUtc = t, endUtc = t.AddMinutes(15), busy = true } },
        });

        var del = await client.DeleteAsync($"/v1/schedule/sources/{source.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await client.GetFromJsonAsync<List<ScheduleEventDto>>(
            $"/v1/schedule/events?from={Uri.EscapeDataString(t.AddMinutes(-5).ToString("O"))}&to={Uri.EscapeDataString(t.AddMinutes(30).ToString("O"))}");
        Assert.Empty(list!);
    }

    private static async Task<SourceDto> CreateUserSourceAsync(HttpClient client)
    {
        var create = await client.PostAsJsonAsync("/v1/schedule/sources", new { type = "User", displayName = "S" });
        create.EnsureSuccessStatusCode();
        var dto = await create.Content.ReadFromJsonAsync<SourceDto>();
        return dto!;
    }

    private sealed record ScheduleEventDto(
        Guid Id,
        Guid SourceId,
        string? ExternalId,
        DateTimeOffset StartUtc,
        DateTimeOffset EndUtc,
        bool Busy);
}
