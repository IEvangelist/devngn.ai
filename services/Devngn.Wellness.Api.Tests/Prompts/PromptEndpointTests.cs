// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Prompts;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Prompts;

/// <summary>
/// Integration tests for the <c>/v1/prompts</c> surface. Delivery tests widen the gap
/// engine's allowed hours to the whole day (<c>0..24</c>) and seed no busy events, so
/// "now" always lands in an active gap regardless of wall-clock time — that lets a
/// prompt be delivered deterministically without overriding <see cref="TimeProvider"/>
/// (which would also desync the real-clock JWT validation). Per-user scoping keeps each
/// test isolated on the shared Postgres container.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class PromptEndpointTests(PostgresContainerFixture postgres)
{
    private static readonly JsonSerializerOptions ClientJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private AuthWebAppFactory Factory() => new(postgres.ConnectionString);

    /// <summary>Allowed-hours widened to the full day so an active gap exists at any real "now".</summary>
    private AuthWebAppFactory WideOpenFactory() => new(postgres.ConnectionString, configureConfig: cfg =>
    {
        cfg["Gaps:EarliestHourLocal"] = "0";
        cfg["Gaps:LatestHourLocal"] = "24";
        cfg["Gaps:MinGapMinutes"] = "1";
    });

    [Fact]
    public async Task Post_next_delivers_and_persists_a_prompt_for_an_active_gap()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        await SeedActivityAsync(factory); // guaranteed no-equipment, short-duration match

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync("/v1/prompts/next", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var prompt = await response.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        Assert.NotNull(prompt);
        Assert.Equal(DeliveryChannel.Web, prompt!.DeliveredVia);
        Assert.NotEqual(Guid.Empty, prompt.ActivityId);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        Assert.True(await db.Prompts.AnyAsync(p => p.Id == prompt.Id && p.UserId == seeded.Id));
    }

    [Fact]
    public async Task Post_next_honours_an_explicit_channel()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        await SeedActivityAsync(factory);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync("/v1/prompts/next?channel=vscode", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var prompt = await response.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        Assert.Equal(DeliveryChannel.Vscode, prompt!.DeliveredVia);
    }

    [Fact]
    public async Task Post_next_is_suppressed_by_cooldown_on_the_second_call()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        await SeedActivityAsync(factory);

        using var client = factory.CreateClientWithBearer(seeded.Token);

        var first = await client.PostAsync("/v1/prompts/next", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Default cooldown is 30 minutes; an immediate second call has no active gap.
        var second = await client.PostAsync("/v1/prompts/next", null);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        Assert.Equal(1, await db.Prompts.CountAsync(p => p.UserId == seeded.Id));
    }

    [Fact]
    public async Task Post_next_without_auth_returns_401()
    {
        using var factory = WideOpenFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsync("/v1/prompts/next", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Post_next_without_consent_returns_403()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync("/v1/prompts/next", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Post_next_with_invalid_channel_returns_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync("/v1/prompts/next?channel=carrier-pigeon", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Post_next_with_unknown_timezone_returns_400()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync("/v1/prompts/next?tz=Made/UpZone", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Dismiss_sets_timestamp_and_is_idempotent()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        var promptId = await SeedPromptAsync(factory, seeded.Id, activityId);

        using var client = factory.CreateClientWithBearer(seeded.Token);

        var first = await client.PostAsync($"/v1/prompts/{promptId}/dismiss", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstBody = await first.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        Assert.NotNull(firstBody!.DismissedAt);

        var second = await client.PostAsync($"/v1/prompts/{promptId}/dismiss", null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondBody = await second.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        // Idempotent: the second call must not overwrite the timestamp. Compare at
        // microsecond resolution since Postgres timestamptz truncates the .NET tick
        // precision that the first (in-memory) response still carries.
        Assert.Equal(
            ToMicroseconds(firstBody.DismissedAt!.Value),
            ToMicroseconds(secondBody!.DismissedAt!.Value));
    }

    [Fact]
    public async Task Complete_sets_completed_at()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        var promptId = await SeedPromptAsync(factory, seeded.Id, activityId);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsync($"/v1/prompts/{promptId}/complete", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        Assert.NotNull(body!.CompletedAt);
    }

    [Fact]
    public async Task Feedback_sets_rating()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        var promptId = await SeedPromptAsync(factory, seeded.Id, activityId);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsJsonAsync($"/v1/prompts/{promptId}/feedback", new { rating = 4 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PromptResponse>(ClientJson);
        Assert.Equal((short)4, body!.FeedbackRating);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public async Task Feedback_with_out_of_range_rating_returns_400(int rating)
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        var promptId = await SeedPromptAsync(factory, seeded.Id, activityId);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.PostAsJsonAsync($"/v1/prompts/{promptId}/feedback", new { rating });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Dismiss_of_another_users_prompt_returns_404()
    {
        using var factory = Factory();
        var owner = await factory.SeedAuthenticatedUserAsync();
        var other = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);
        var promptId = await SeedPromptAsync(factory, owner.Id, activityId);

        using var client = factory.CreateClientWithBearer(other.Token);
        var response = await client.PostAsync($"/v1/prompts/{promptId}/dismiss", null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_history_returns_only_the_callers_prompts_most_recent_first()
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        var stranger = await factory.SeedAuthenticatedUserAsync();
        var activityId = await SeedActivityAsync(factory);

        var baseTime = DateTimeOffset.UtcNow.AddHours(-3);
        await SeedPromptAsync(factory, seeded.Id, activityId, baseTime);
        await SeedPromptAsync(factory, seeded.Id, activityId, baseTime.AddHours(1));
        await SeedPromptAsync(factory, seeded.Id, activityId, baseTime.AddHours(2));
        await SeedPromptAsync(factory, stranger.Id, activityId, baseTime.AddHours(1));

        using var client = factory.CreateClientWithBearer(seeded.Token);
        var response = await client.GetAsync("/v1/prompts");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var rows = await response.Content.ReadFromJsonAsync<List<PromptResponse>>(ClientJson);
        Assert.NotNull(rows);
        Assert.Equal(3, rows!.Count);
        for (var i = 1; i < rows.Count; i++)
        {
            Assert.True(rows[i - 1].DeliveredAt >= rows[i].DeliveredAt, "History must be newest-first.");
        }
    }

    [Fact]
    public async Task Get_stream_emits_a_prompt_event_for_an_active_gap()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        await SeedActivityAsync(factory);

        using var client = factory.CreateClientWithBearer(seeded.Token);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));

        using var response = await client.GetAsync(
            "/v1/prompts/stream", HttpCompletionOption.ResponseHeadersRead, cts.Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        using var reader = new StreamReader(stream);

        string? dataLine = null;
        string? line;
        while ((line = await reader.ReadLineAsync(cts.Token)) is not null)
        {
            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                dataLine = line;
                break;
            }
        }

        Assert.NotNull(dataLine);
        var json = dataLine!["data:".Length..].Trim();
        var prompt = JsonSerializer.Deserialize<PromptResponse>(json, ClientJson);
        Assert.NotNull(prompt);
        Assert.Equal(DeliveryChannel.Web, prompt!.DeliveredVia);
    }

    [Fact]
    public async Task Get_stream_without_consent_returns_403()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var response = await client.GetAsync(
            "/v1/prompts/stream", HttpCompletionOption.ResponseHeadersRead, cts.Token);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task WebSocket_pushes_a_prompt_frame_for_an_active_gap()
    {
        using var factory = WideOpenFactory();
        var seeded = await factory.SeedAuthenticatedUserAsync();
        await SeedActivityAsync(factory);

        var wsClient = factory.Server.CreateWebSocketClient();
        wsClient.ConfigureRequest = req => req.Headers["Authorization"] = $"Bearer {seeded.Token}";

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var uri = new UriBuilder(factory.Server.BaseAddress) { Scheme = "ws", Path = "/v1/prompts/ws" }.Uri;
        using var socket = await wsClient.ConnectAsync(uri, cts.Token);

        var buffer = new byte[16 * 1024];
        var result = await socket.ReceiveAsync(buffer, cts.Token);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);

        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
        var prompt = JsonSerializer.Deserialize<PromptResponse>(json, ClientJson);
        Assert.NotNull(prompt);
        Assert.Equal(DeliveryChannel.Web, prompt!.DeliveredVia);

        // Push-only stream: the server never reads, so a graceful close handshake would
        // block. Abort tears the client side down without waiting for an ack.
        socket.Abort();
    }

    private static DateTimeOffset ToMicroseconds(DateTimeOffset value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMicrosecond), value.Offset);

    private static async Task<Guid> SeedActivityAsync(AuthWebAppFactory factory)
    {
        var slug = $"test-{Guid.NewGuid():N}";
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var activity = new Activity
        {
            Slug = slug,
            Title = slug,
            Description = "Test activity",
            BodyArea = BodyArea.Core,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 30,
            EquipmentTags = [],
            AnimationProvider = "local",
            AnimationAssetId = slug,
        };
        db.Activities.Add(activity);
        await db.SaveChangesAsync();
        return activity.Id;
    }

    private static async Task<Guid> SeedPromptAsync(
        AuthWebAppFactory factory,
        Guid userId,
        Guid activityId,
        DateTimeOffset? deliveredAt = null)
    {
        var when = deliveredAt ?? DateTimeOffset.UtcNow;
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var prompt = new Prompt
        {
            UserId = userId,
            ActivityId = activityId,
            GapStartUtc = when,
            GapEndUtc = when.AddMinutes(30),
            DeliveredAt = when,
            DeliveredVia = DeliveryChannel.Web,
        };
        db.Prompts.Add(prompt);
        await db.SaveChangesAsync();
        return prompt.Id;
    }
}
