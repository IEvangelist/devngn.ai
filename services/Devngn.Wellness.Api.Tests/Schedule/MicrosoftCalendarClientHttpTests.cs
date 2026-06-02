// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Text;
using Devngn.Wellness.Api.Schedule.Microsoft;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule;

/// <summary>
/// Unit tests for the wire-level behavior of <see cref="MicrosoftCalendarClient"/> —
/// no Postgres, no TestServer. Each test wires the client to a programmable HTTP
/// message handler and asserts on the parsed outcome / pagination / error mapping.
/// These tests directly exercise the rubber-duck blocking findings (#1, #2, #3, #7).
/// </summary>
public sealed class MicrosoftCalendarClientHttpTests
{
    private static MicrosoftCalendarOptions DefaultOptions() => new()
    {
        ClientId = "cid",
        ClientSecret = "csec",
        RedirectUri = "https://localhost/cb",
        TenantId = "common",
        Scope = "Calendars.Read offline_access",
        RequestTimeout = TimeSpan.FromSeconds(5),
        MaxPagesPerSync = 5,
    };

    private static MicrosoftCalendarClient BuildClient(StubHandler handler, MicrosoftCalendarOptions? options = null)
    {
        var services = new ServiceCollection();
        services.AddHttpClient(MicrosoftCalendarClient.TokenHttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        services.AddHttpClient(MicrosoftCalendarClient.GraphHttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        var sp = services.BuildServiceProvider();
        var factory = sp.GetRequiredService<IHttpClientFactory>();
        return new MicrosoftCalendarClient(
            factory,
            Options.Create(options ?? DefaultOptions()),
            TimeProvider.System,
            NullLogger<MicrosoftCalendarClient>.Instance);
    }

    // --- Token endpoint: invalid_grant detection ---

    [Fact]
    public async Task Refresh_with_invalid_grant_string_throws_InvalidGrant()
    {
        var handler = StubHandler.Json(HttpStatusCode.BadRequest, """{"error":"invalid_grant","error_description":"oops"}""");
        var client = BuildClient(handler);
        await Assert.ThrowsAsync<MicrosoftInvalidGrantException>(() => client.RefreshAccessTokenAsync("rt", default));
    }

    [Fact]
    public async Task Refresh_with_AADSTS70008_in_description_throws_InvalidGrant()
    {
        // Real-world MS responses sometimes report a generic `invalid_request` error
        // with the AADSTS code only in the description. Our matcher must still catch it.
        var handler = StubHandler.Json(HttpStatusCode.BadRequest, """{"error":"invalid_request","error_description":"AADSTS70008: The refresh token has expired due to inactivity."}""");
        var client = BuildClient(handler);
        await Assert.ThrowsAsync<MicrosoftInvalidGrantException>(() => client.RefreshAccessTokenAsync("rt", default));
    }

    [Fact]
    public async Task Refresh_with_AADSTS_in_error_codes_array_throws_InvalidGrant()
    {
        var handler = StubHandler.Json(HttpStatusCode.BadRequest, """{"error":"interaction_required","error_codes":[70008]}""");
        var client = BuildClient(handler);
        await Assert.ThrowsAsync<MicrosoftInvalidGrantException>(() => client.RefreshAccessTokenAsync("rt", default));
    }

    [Fact]
    public async Task Refresh_with_429_throws_Transient_not_InvalidGrant()
    {
        // Per rubber-duck #3: 429 must be classified transient, not invalid_grant.
        var handler = StubHandler.Json(HttpStatusCode.TooManyRequests, """{"error":"server_error","error_description":"throttled"}""");
        var client = BuildClient(handler);
        await Assert.ThrowsAsync<MicrosoftTransientException>(() => client.RefreshAccessTokenAsync("rt", default));
    }

    [Fact]
    public async Task Refresh_with_500_throws_Transient()
    {
        var handler = StubHandler.Json(HttpStatusCode.InternalServerError, """{"error":"server_error"}""");
        var client = BuildClient(handler);
        await Assert.ThrowsAsync<MicrosoftTransientException>(() => client.RefreshAccessTokenAsync("rt", default));
    }

    [Fact]
    public async Task Refresh_success_returns_token_with_rotated_refresh()
    {
        var handler = StubHandler.Json(HttpStatusCode.OK, """{"access_token":"at","refresh_token":"rt2","expires_in":3599,"scope":"Calendars.Read","token_type":"Bearer"}""");
        var client = BuildClient(handler);
        var result = await client.RefreshAccessTokenAsync("rt1", default);
        Assert.Equal("at", result.AccessToken);
        Assert.Equal("rt2", result.RefreshToken);
        Assert.Equal("Calendars.Read", result.GrantedScope);
    }

    [Fact]
    public async Task Refresh_success_with_no_refresh_token_returns_null_refresh()
    {
        // Sync service is responsible for preserving the old token in this case.
        var handler = StubHandler.Json(HttpStatusCode.OK, """{"access_token":"at","expires_in":3599,"scope":"Calendars.Read","token_type":"Bearer"}""");
        var client = BuildClient(handler);
        var result = await client.RefreshAccessTokenAsync("rt1", default);
        Assert.Equal("at", result.AccessToken);
        Assert.Null(result.RefreshToken);
    }

    // --- calendarView: status mapping ---

    [Fact]
    public async Task CalendarView_with_401_throws_InvalidGrant()
    {
        var handler = StubHandler.Json(HttpStatusCode.Unauthorized, """{"error":{"code":"InvalidAuthenticationToken"}}""");
        var client = BuildClient(handler);
        var from = DateTimeOffset.UtcNow;
        await Assert.ThrowsAsync<MicrosoftInvalidGrantException>(
            () => client.QueryBusyWindowsAsync("at", from, from.AddDays(1), default));
    }

    [Fact]
    public async Task CalendarView_with_403_throws_Forbidden_not_InvalidGrant()
    {
        // Per rubber-duck #1: 403 must be Forbidden so the caller records a non-destructive Error.
        var handler = StubHandler.Json(HttpStatusCode.Forbidden, """{"error":{"code":"ErrorAccessDenied"}}""");
        var client = BuildClient(handler);
        var from = DateTimeOffset.UtcNow;
        await Assert.ThrowsAsync<MicrosoftForbiddenException>(
            () => client.QueryBusyWindowsAsync("at", from, from.AddDays(1), default));
    }

    [Fact]
    public async Task CalendarView_with_429_throws_Transient()
    {
        var handler = StubHandler.Json(HttpStatusCode.TooManyRequests, """{"error":{"code":"TooManyRequests"}}""");
        var client = BuildClient(handler);
        var from = DateTimeOffset.UtcNow;
        await Assert.ThrowsAsync<MicrosoftTransientException>(
            () => client.QueryBusyWindowsAsync("at", from, from.AddDays(1), default));
    }

    // --- calendarView: UTC parsing without 'Z' suffix ---

    [Fact]
    public async Task CalendarView_parses_utc_dateTime_without_Z_suffix()
    {
        // Graph dateTime values come back as "2026-01-01T12:00:00.0000000" with timeZone:"UTC".
        // Our parser must treat this as UTC, not as local time.
        var body = """
        {
          "value": [
            {
              "start": { "dateTime": "2026-01-01T12:00:00.0000000", "timeZone": "UTC" },
              "end":   { "dateTime": "2026-01-01T13:30:00.0000000", "timeZone": "UTC" },
              "showAs": "busy",
              "isCancelled": false
            }
          ]
        }
        """;
        var handler = StubHandler.Json(HttpStatusCode.OK, body);
        var client = BuildClient(handler);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), default);
        Assert.Single(result);
        Assert.Equal(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero), result[0].StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 1, 1, 13, 30, 0, TimeSpan.Zero), result[0].EndUtc);
    }

    [Fact]
    public async Task CalendarView_skips_cancelled_events()
    {
        var body = """
        {
          "value": [
            {
              "start": { "dateTime": "2026-01-01T12:00:00.0000000", "timeZone": "UTC" },
              "end":   { "dateTime": "2026-01-01T13:00:00.0000000", "timeZone": "UTC" },
              "showAs": "busy",
              "isCancelled": true
            }
          ]
        }
        """;
        var handler = StubHandler.Json(HttpStatusCode.OK, body);
        var client = BuildClient(handler);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), default);
        Assert.Empty(result);
    }

    [Fact]
    public async Task CalendarView_skips_free_showAs()
    {
        var body = """
        {
          "value": [
            {
              "start": { "dateTime": "2026-01-01T12:00:00.0000000", "timeZone": "UTC" },
              "end":   { "dateTime": "2026-01-01T13:00:00.0000000", "timeZone": "UTC" },
              "showAs": "free",
              "isCancelled": false
            }
          ]
        }
        """;
        var handler = StubHandler.Json(HttpStatusCode.OK, body);
        var client = BuildClient(handler);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), default);
        Assert.Empty(result);
    }

    [Fact]
    public async Task CalendarView_includes_tentative_workingElsewhere_and_oof()
    {
        var body = """
        {
          "value": [
            { "start": { "dateTime": "2026-01-01T12:00:00.0000000", "timeZone": "UTC" }, "end": { "dateTime": "2026-01-01T13:00:00.0000000", "timeZone": "UTC" }, "showAs": "tentative", "isCancelled": false },
            { "start": { "dateTime": "2026-01-02T12:00:00.0000000", "timeZone": "UTC" }, "end": { "dateTime": "2026-01-02T13:00:00.0000000", "timeZone": "UTC" }, "showAs": "workingElsewhere", "isCancelled": false },
            { "start": { "dateTime": "2026-01-03T12:00:00.0000000", "timeZone": "UTC" }, "end": { "dateTime": "2026-01-03T13:00:00.0000000", "timeZone": "UTC" }, "showAs": "oof", "isCancelled": false }
          ]
        }
        """;
        var handler = StubHandler.Json(HttpStatusCode.OK, body);
        var client = BuildClient(handler);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), default);
        Assert.Equal(3, result.Count);
    }

    // --- calendarView: pagination via @odata.nextLink ---

    [Fact]
    public async Task CalendarView_follows_odata_nextLink_across_pages()
    {
        var page1 = """
        {
          "value": [
            { "start": { "dateTime": "2026-01-01T08:00:00.0000000", "timeZone": "UTC" }, "end": { "dateTime": "2026-01-01T09:00:00.0000000", "timeZone": "UTC" }, "showAs": "busy", "isCancelled": false }
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=page2"
        }
        """;
        var page2 = """
        {
          "value": [
            { "start": { "dateTime": "2026-01-02T08:00:00.0000000", "timeZone": "UTC" }, "end": { "dateTime": "2026-01-02T09:00:00.0000000", "timeZone": "UTC" }, "showAs": "busy", "isCancelled": false }
          ]
        }
        """;

        var handler = new StubHandler(req =>
        {
            // Verify the Authorization header AND the Prefer header carry forward across pages.
            Assert.Equal("Bearer", req.Headers.Authorization?.Scheme);
            Assert.Contains(req.Headers.GetValues("Prefer"), v => v.Contains("outlook.timezone=\"UTC\"", StringComparison.Ordinal));
            var url = req.RequestUri!.ToString();
            var body = url.Contains("skiptoken=page2", StringComparison.Ordinal) ? page2 : page1;
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
        });
        var client = BuildClient(handler);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(2), default);
        Assert.Equal(2, result.Count);
        Assert.Equal(2, handler.CallCount);
    }

    [Fact]
    public async Task CalendarView_stops_pagination_at_MaxPagesPerSync()
    {
        // Defensive bound: don't loop forever on a misbehaving server.
        var body = """
        {
          "value": [],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=next"
        }
        """;
        var opts = DefaultOptions();
        opts.MaxPagesPerSync = 3;
        var handler = StubHandler.Json(HttpStatusCode.OK, body);
        var client = BuildClient(handler, opts);
        var result = await client.QueryBusyWindowsAsync("at",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), default);
        Assert.Empty(result);
        Assert.Equal(3, handler.CallCount);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public int CallCount;

        public static StubHandler Json(HttpStatusCode status, string body) =>
            new(_ => new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref CallCount);
            return Task.FromResult(responder(request));
        }
    }
}
