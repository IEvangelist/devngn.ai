// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Microsoft;

/// <summary>
/// HTTP-based Microsoft Graph client. Deliberately does NOT pull in the
/// <c>Microsoft.Graph</c> SDK: the wellness service needs only OAuth token exchange and
/// <c>/me/calendarView</c>, and the SDK's <c>GraphServiceClient</c> + auth provider
/// would fight with our own refresh-token persistence and resilience choices.
/// </summary>
internal sealed class MicrosoftCalendarClient(
    IHttpClientFactory httpClientFactory,
    IOptions<MicrosoftCalendarOptions> options,
    TimeProvider clock,
    ILogger<MicrosoftCalendarClient> logger) : IMicrosoftCalendarClient
{
    public const string TokenHttpClientName = "microsoft-oauth-token";
    public const string GraphHttpClientName = "microsoft-graph-api";

    private const string CalendarViewBase = "https://graph.microsoft.com/v1.0/me/calendarView";

    // AADSTS codes that unambiguously mean "the refresh token is unusable; user must
    // reconnect". The list is intentionally narrow — broader codes (e.g. AADSTS50105,
    // AADSTS50020) are reported as InvalidOperation so we don't punish a perfectly
    // valid refresh token because of a temporary directory glitch.
    // - AADSTS50173: external sec ID change; token invalidated.
    // - AADSTS70008: refresh token expired or revoked.
    // - AADSTS700082/700084: refresh token expired due to inactivity / max-age.
    // - AADSTS54005: OAuth2 code single-use already redeemed (initial exchange only).
    // - AADSTS9002313: invalid request (often a malformed/expired code).
    private static readonly string[] InvalidGrantAadstsCodes =
    [
        "AADSTS50173",
        "AADSTS70008",
        "AADSTS700082",
        "AADSTS700084",
        "AADSTS54005",
        "AADSTS9002313",
    ];

    private static readonly HashSet<int> InvalidGrantAadstsNumericCodes =
    [
        50173, 70008, 700082, 700084, 54005, 9002313,
    ];

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<MicrosoftTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct)
    {
        var opts = options.Value;
        var form = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["client_id"] = opts.ClientId,
            ["client_secret"] = opts.ClientSecret,
            ["code"] = code,
            ["code_verifier"] = codeVerifier,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = opts.RedirectUri,
            ["scope"] = opts.Scope,
        };
        return await PostTokenRequestAsync(form, isRefresh: false, ct);
    }

    public async Task<MicrosoftTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct)
    {
        var opts = options.Value;
        var form = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["client_id"] = opts.ClientId,
            ["client_secret"] = opts.ClientSecret,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
            ["scope"] = opts.Scope,
        };
        return await PostTokenRequestAsync(form, isRefresh: true, ct);
    }

    private async Task<MicrosoftTokenResult> PostTokenRequestAsync(Dictionary<string, string> form, bool isRefresh, CancellationToken ct)
    {
        var opts = options.Value;
        var client = httpClientFactory.CreateClient(TokenHttpClientName);
        var tokenEndpoint = $"https://login.microsoftonline.com/{Uri.EscapeDataString(opts.TenantId)}/oauth2/v2.0/token";
        using var request = new HttpRequestMessage(HttpMethod.Post, tokenEndpoint)
        {
            Content = new FormUrlEncodedContent(form),
        };

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new MicrosoftTransientException("Network failure during Microsoft token exchange.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new MicrosoftTransientException("Microsoft token exchange timed out.", ex);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            var error = await ParseErrorAsync(stream, ct);
            // invalid_grant is the canonical "refresh token can't be used" signal.
            // We also map a small set of AADSTS codes that mean the same thing even if
            // Microsoft phrased the top-level error differently.
            var isInvalidGrant = string.Equals(error.Error, "invalid_grant", StringComparison.Ordinal)
                || (error.ErrorDescription is { Length: > 0 } desc && InvalidGrantAadstsCodes.Any(c => desc.Contains(c, StringComparison.Ordinal)))
                || (error.ErrorCodes is { Length: > 0 } codes && codes.Any(InvalidGrantAadstsNumericCodes.Contains));

            if (isInvalidGrant)
            {
                throw new MicrosoftInvalidGrantException(error.ErrorDescription ?? "invalid_grant");
            }

            // 429 and 5xx are transient; surface Retry-After-aware error message but
            // don't block-wait on it (the standard resilience handler does its own backoff
            // when we re-enable it elsewhere).
            if ((int)response.StatusCode >= 500
                || response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.RequestTimeout)
            {
                throw new MicrosoftTransientException($"Microsoft token endpoint returned {(int)response.StatusCode}: {error.Error}");
            }

            logger.LogWarning(
                "Microsoft token endpoint returned {StatusCode} {Error} ({Description}) for isRefresh={IsRefresh}.",
                (int)response.StatusCode, error.Error, error.ErrorDescription, isRefresh);
            throw new InvalidOperationException(
                $"Microsoft token endpoint returned {(int)response.StatusCode}: {error.Error}");
        }

        var payload = await JsonSerializer.DeserializeAsync<MicrosoftTokenResponse>(stream, JsonOptions, ct)
            ?? throw new MicrosoftTransientException("Microsoft returned an empty token payload.");

        if (string.IsNullOrEmpty(payload.AccessToken))
        {
            throw new MicrosoftTransientException("Microsoft token response is missing access_token.");
        }

        var expiresAt = clock.GetUtcNow().AddSeconds(payload.ExpiresIn > 0 ? payload.ExpiresIn : 3300);
        return new MicrosoftTokenResult(payload.AccessToken, payload.RefreshToken, payload.Scope, expiresAt);
    }

    public async Task<IReadOnlyList<MicrosoftBusyWindow>> QueryBusyWindowsAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        var opts = options.Value;
        var client = httpClientFactory.CreateClient(GraphHttpClientName);
        var startIso = from.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        var endIso = to.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        var firstPageUrl = $"{CalendarViewBase}"
            + $"?startDateTime={Uri.EscapeDataString(startIso)}"
            + $"&endDateTime={Uri.EscapeDataString(endIso)}"
            + "&$select=start,end,showAs,isCancelled"
            + "&$top=999";

        var aggregated = new List<MicrosoftBusyWindow>();
        var nextUrl = firstPageUrl;
        var pagesFetched = 0;

        while (!string.IsNullOrEmpty(nextUrl))
        {
            if (pagesFetched >= opts.MaxPagesPerSync)
            {
                logger.LogWarning(
                    "Stopping Microsoft calendarView pagination at {Pages} pages (max: {Max}).",
                    pagesFetched, opts.MaxPagesPerSync);
                break;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, nextUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            // Force Graph to render start/end in UTC. Without this, the response carries
            // the user's mailbox-default time zone — and the JSON dateTime field has no
            // 'Z' suffix, so naive parsing would silently misinterpret times.
            request.Headers.Add("Prefer", "outlook.timezone=\"UTC\"");

            HttpResponseMessage response;
            try
            {
                response = await client.SendAsync(request, ct);
            }
            catch (HttpRequestException ex)
            {
                throw new MicrosoftTransientException("Network failure during Microsoft calendarView.", ex);
            }
            catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
            {
                throw new MicrosoftTransientException("Microsoft calendarView timed out.", ex);
            }

            if (!response.IsSuccessStatusCode)
            {
                // 401 here is almost always "access token expired/invalidated mid-window"
                // — the refresh exchange would have caught a permanently-bad refresh token
                // first. Map to NeedsReconnect because Microsoft has explicitly rejected
                // our bearer, but distinguish from 403 (policy/permission) below.
                if (response.StatusCode == HttpStatusCode.Unauthorized)
                {
                    throw new MicrosoftInvalidGrantException("Microsoft Graph returned 401 for calendarView (access token rejected).");
                }
                // 403 is a tenant policy / conditional access / scope-not-granted answer,
                // not a "go reconnect" answer. Surface it as Forbidden so the caller can
                // record a non-destructive error.
                if (response.StatusCode == HttpStatusCode.Forbidden)
                {
                    throw new MicrosoftForbiddenException("Microsoft Graph returned 403 for calendarView.");
                }
                if (response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.RequestTimeout
                    || (int)response.StatusCode >= 500)
                {
                    throw new MicrosoftTransientException($"Microsoft Graph returned {(int)response.StatusCode} for calendarView.");
                }

                throw new InvalidOperationException($"Microsoft Graph returned {(int)response.StatusCode} for calendarView.");
            }

            var page = await response.Content.ReadFromJsonAsync<CalendarViewResponse>(JsonOptions, ct)
                ?? throw new MicrosoftTransientException("Microsoft calendarView returned empty payload.");

            foreach (var entry in page.Value ?? [])
            {
                if (entry.IsCancelled)
                {
                    continue;
                }
                if (!IsBusyShowAs(entry.ShowAs))
                {
                    continue;
                }

                var start = ParseGraphUtc(entry.Start);
                var end = ParseGraphUtc(entry.End);
                if (start is null || end is null || end <= start)
                {
                    continue;
                }
                aggregated.Add(new MicrosoftBusyWindow(start.Value, end.Value));
            }

            nextUrl = page.NextLink;
            pagesFetched++;
        }

        return aggregated;
    }

    /// <summary>
    /// Treat <c>busy</c>, <c>oof</c>, <c>workingElsewhere</c>, and <c>tentative</c> as
    /// "the user is unavailable". Tentative is included by design: a maybe-meeting is
    /// not the right moment to ship a wellness prompt — the user is more likely than
    /// average to be in a call mid-decision.
    /// </summary>
    private static bool IsBusyShowAs(string? showAs) =>
        showAs is "busy" or "oof" or "workingElsewhere" or "tentative";

    private static DateTimeOffset? ParseGraphUtc(CalendarDateTime? dt)
    {
        if (dt is null || string.IsNullOrEmpty(dt.DateTime))
        {
            return null;
        }
        // We sent Prefer: outlook.timezone="UTC", so we EXPECT timeZone == "UTC". If
        // Graph ever surprises us, bail rather than misinterpret.
        if (!string.Equals(dt.TimeZone, "UTC", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        // Graph returns dateTime without a trailing 'Z' — e.g. "2026-01-01T12:00:00.0000000".
        // Parse as Unspecified (DateTime) then promote to UTC explicitly so we never let
        // the runtime's local time zone leak into the result.
        if (!DateTime.TryParse(dt.DateTime, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
        {
            return null;
        }
        return new DateTimeOffset(parsed, TimeSpan.Zero);
    }

    private static async Task<MicrosoftErrorPayload> ParseErrorAsync(Stream stream, CancellationToken ct)
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<MicrosoftErrorPayload>(stream, JsonOptions, ct)
                ?? new MicrosoftErrorPayload("unknown", null, null);
        }
        catch (JsonException)
        {
            return new MicrosoftErrorPayload("unknown", null, null);
        }
    }

    private sealed record MicrosoftErrorPayload(
        [property: JsonPropertyName("error")] string Error,
        [property: JsonPropertyName("error_description")] string? ErrorDescription,
        [property: JsonPropertyName("error_codes")] int[]? ErrorCodes);

    private sealed record MicrosoftTokenResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("scope")] string? Scope,
        [property: JsonPropertyName("token_type")] string? TokenType);

    private sealed record CalendarViewResponse(
        [property: JsonPropertyName("value")] List<CalendarEvent>? Value,
        [property: JsonPropertyName("@odata.nextLink")] string? NextLink);

    private sealed record CalendarEvent(
        [property: JsonPropertyName("start")] CalendarDateTime? Start,
        [property: JsonPropertyName("end")] CalendarDateTime? End,
        [property: JsonPropertyName("showAs")] string? ShowAs,
        [property: JsonPropertyName("isCancelled")] bool IsCancelled);

    private sealed record CalendarDateTime(
        [property: JsonPropertyName("dateTime")] string? DateTime,
        [property: JsonPropertyName("timeZone")] string? TimeZone);
}
