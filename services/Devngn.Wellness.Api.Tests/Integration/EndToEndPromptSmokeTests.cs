// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Prompts;
using Devngn.Wellness.Api.Schedule.Gaps;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using SourceDto = Devngn.Wellness.Api.Tests.Endpoints.ScheduleSourceEndpointTests.ScheduleSourceDto;

namespace Devngn.Wellness.Api.Tests.Integration;

/// <summary>
/// Phase 16 end-to-end smoke. Drives the entire public pipeline the way the CLI daemon
/// and VS Code extension do — accept consent, register a user schedule source, push a
/// fake schedule that brackets a free window containing "now", confirm the gap engine
/// surfaces it, then subscribe to the SSE prompt stream on the <c>cli</c> channel (the
/// exact channel <c>@devngn/wellness-client</c> consumes) and assert a movement-break
/// prompt for that live gap arrives within seconds.
/// </summary>
/// <remarks>
/// Authentication is the only hop that cannot run headlessly (real GitHub OAuth device
/// flow needs a human), so the authenticated user is minted via the shared test-JWT seam
/// and consent is then accepted through the real <c>POST /v1/consent</c> endpoint —
/// everything downstream of auth flows through the public HTTP/SSE surface. Allowed hours
/// are widened to the whole day so "now" is always in-policy regardless of wall-clock,
/// matching the existing prompt-delivery tests and avoiding a <see cref="TimeProvider"/>
/// override that would desync real-clock JWT validation.
/// </remarks>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class EndToEndPromptSmokeTests(PostgresContainerFixture postgres)
{
    private static readonly JsonSerializerOptions ClientJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private AuthWebAppFactory WideOpenFactory() => new(postgres.ConnectionString, configureConfig: cfg =>
    {
        cfg["Gaps:EarliestHourLocal"] = "0";
        cfg["Gaps:LatestHourLocal"] = "24";
        cfg["Gaps:MinGapMinutes"] = "1";
    });

    [Fact]
    public async Task Pushing_a_schedule_with_a_live_gap_delivers_a_cli_prompt_over_sse()
    {
        using var factory = WideOpenFactory();

        // 1. Authenticated user (test-JWT seam stands in for the GitHub device flow), no consent yet.
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        // 2. Accept consent through the real endpoint — every wellness write is gated on it.
        var consent = await client.PostAsJsonAsync("/v1/consent", new { version = "1.0" });
        consent.EnsureSuccessStatusCode();

        // 3. Register a user-provided schedule source.
        var sourceResponse = await client.PostAsJsonAsync(
            "/v1/schedule/sources", new { type = "User", displayName = "Local push" });
        Assert.Equal(HttpStatusCode.Created, sourceResponse.StatusCode);
        var source = await sourceResponse.Content.ReadFromJsonAsync<SourceDto>(ClientJson);
        Assert.NotNull(source);

        // 4. Push a fake schedule: a meeting that just ended and one starting soon, leaving "now"
        //    inside a free window. ClipByNow keeps the live portion (now .. laterMeetingStart).
        var now = DateTimeOffset.UtcNow;
        var laterMeetingStart = now.AddMinutes(30);
        var push = await client.PostAsJsonAsync("/v1/schedule/events", new
        {
            sourceId = source!.Id,
            items = new[]
            {
                new { externalId = "past-meeting", startUtc = now.AddMinutes(-60), endUtc = now.AddMinutes(-10), busy = true },
                new { externalId = "later-meeting", startUtc = laterMeetingStart, endUtc = now.AddMinutes(90), busy = true },
            },
        });
        push.EnsureSuccessStatusCode();

        // 5. Confirm the pushed schedule produced a live gap that ends at the later meeting's start.
        var gapsResponse = await client.GetAsync(
            $"/v1/gaps?from={Uri.EscapeDataString(now.AddMinutes(-90).ToString("O"))}" +
            $"&to={Uri.EscapeDataString(now.AddMinutes(120).ToString("O"))}&tz=UTC");
        Assert.Equal(HttpStatusCode.OK, gapsResponse.StatusCode);
        var gaps = await gapsResponse.Content.ReadFromJsonAsync<List<GapResponse>>(ClientJson);
        Assert.NotNull(gaps);
        Assert.Contains(gaps!, g => Math.Abs((g.EndUtc - laterMeetingStart).TotalMinutes) < 2 && g.EndUtc > now);

        // 6. Guarantee a deterministic match for the smoke (no equipment, short duration). The
        //    catalog content itself is covered by the activity-catalog tests; here we only need
        //    one activity the matcher can pair with the live gap.
        await SeedMatchableActivityAsync(factory);

        // 7. Subscribe to the SSE stream on the CLI channel and assert a prompt arrives within seconds.
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var stream = await client.GetAsync(
            "/v1/prompts/stream?channel=cli&tz=UTC", HttpCompletionOption.ResponseHeadersRead, cts.Token);
        Assert.Equal(HttpStatusCode.OK, stream.StatusCode);
        Assert.Equal("text/event-stream", stream.Content.Headers.ContentType?.MediaType);

        var prompt = await ReadFirstPromptAsync(stream, cts.Token);
        Assert.NotNull(prompt);
        Assert.Equal(DeliveryChannel.Cli, prompt!.DeliveredVia);
        Assert.False(string.IsNullOrWhiteSpace(prompt.ActivitySlug));
        Assert.True(prompt.GapEndUtc > now, "The delivered prompt must target the live gap.");
        Assert.True(prompt.GapStartUtc <= prompt.GapEndUtc);
    }

    private static async Task<PromptResponse?> ReadFirstPromptAsync(HttpResponseMessage response, CancellationToken ct)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync(ct)) is not null)
        {
            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                var json = line["data:".Length..].Trim();
                return JsonSerializer.Deserialize<PromptResponse>(json, ClientJson);
            }
        }

        return null;
    }

    private static async Task SeedMatchableActivityAsync(AuthWebAppFactory factory)
    {
        var slug = $"e2e-{Guid.NewGuid():N}";
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        db.Activities.Add(new Activity
        {
            Slug = slug,
            Title = slug,
            Description = "End-to-end smoke activity",
            BodyArea = BodyArea.Core,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 30,
            EquipmentTags = [],
            AnimationProvider = "local",
            AnimationAssetId = slug,
        });
        await db.SaveChangesAsync();
    }
}
