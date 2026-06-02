// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Google;

/// <summary>
/// HTTP-based Google Calendar client. Deliberately does NOT pull in
/// <c>Google.Apis.Calendar.v3</c>: the wellness service needs only token exchange and
/// free/busy lookup, and the SDK's <c>IDataStore</c>-driven credential model would
/// fight with our own refresh-token persistence.
/// </summary>
internal sealed class GoogleCalendarClient(
    IHttpClientFactory httpClientFactory,
    IOptions<GoogleCalendarOptions> options,
    TimeProvider clock,
    ILogger<GoogleCalendarClient> logger) : IGoogleCalendarClient
{
    public const string TokenHttpClientName = "google-oauth-token";
    public const string CalendarHttpClientName = "google-calendar-api";

    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string FreeBusyEndpoint = "https://www.googleapis.com/calendar/v3/freeBusy";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GoogleTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct)
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
        };
        return await PostTokenRequestAsync(form, isRefresh: false, ct);
    }

    public async Task<GoogleTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct)
    {
        var opts = options.Value;
        var form = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["client_id"] = opts.ClientId,
            ["client_secret"] = opts.ClientSecret,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
        };
        return await PostTokenRequestAsync(form, isRefresh: true, ct);
    }

    private async Task<GoogleTokenResult> PostTokenRequestAsync(Dictionary<string, string> form, bool isRefresh, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(TokenHttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, TokenEndpoint)
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
            throw new GoogleTransientException("Network failure during Google token exchange.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new GoogleTransientException("Google token exchange timed out.", ex);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            var error = await ParseErrorAsync(stream, ct);
            // Google returns 400 invalid_grant for both expired auth codes and revoked
            // refresh tokens. On the refresh path that means "user must reconnect";
            // on the code path it's a one-shot exchange so the user retries from scratch.
            if (string.Equals(error.Error, "invalid_grant", StringComparison.Ordinal))
            {
                throw new GoogleInvalidGrantException(error.ErrorDescription ?? "invalid_grant");
            }

            if ((int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.RequestTimeout)
            {
                throw new GoogleTransientException($"Google token endpoint returned {(int)response.StatusCode}: {error.Error}");
            }

            logger.LogWarning(
                "Google token endpoint returned {StatusCode} {Error} ({Description}) for isRefresh={IsRefresh}.",
                (int)response.StatusCode, error.Error, error.ErrorDescription, isRefresh);
            throw new InvalidOperationException(
                $"Google token endpoint returned {(int)response.StatusCode}: {error.Error}");
        }

        var payload = await JsonSerializer.DeserializeAsync<GoogleTokenResponse>(stream, JsonOptions, ct)
            ?? throw new GoogleTransientException("Google returned an empty token payload.");

        if (string.IsNullOrEmpty(payload.AccessToken))
        {
            throw new GoogleTransientException("Google token response is missing access_token.");
        }

        var expiresAt = clock.GetUtcNow().AddSeconds(payload.ExpiresIn > 0 ? payload.ExpiresIn : 3300);
        return new GoogleTokenResult(payload.AccessToken, payload.RefreshToken, payload.Scope, expiresAt);
    }

    public async Task<IReadOnlyList<GoogleBusyWindow>> QueryFreeBusyAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(CalendarHttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, FreeBusyEndpoint)
        {
            Headers =
            {
                Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken),
            },
            Content = JsonContent.Create(new FreeBusyRequest(
                from.ToUniversalTime(),
                to.ToUniversalTime(),
                [new FreeBusyItem("primary")]), options: JsonOptions),
        };

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new GoogleTransientException("Network failure during Google freeBusy.query.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new GoogleTransientException("Google freeBusy.query timed out.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                // 401/403 here usually means the access token has been revoked
                // (something the refresh exchange would have caught with invalid_grant
                // if we'd tried). Treat it the same way so the source flips to NeedsReconnect.
                throw new GoogleInvalidGrantException($"Google freeBusy.query returned {(int)response.StatusCode}.");
            }
            throw new GoogleTransientException($"Google freeBusy.query returned {(int)response.StatusCode}.");
        }

        var body = await response.Content.ReadFromJsonAsync<FreeBusyResponse>(JsonOptions, ct)
            ?? throw new GoogleTransientException("Google freeBusy.query returned empty payload.");

        if (!body.Calendars.TryGetValue("primary", out var primary) || primary.Busy is null)
        {
            return [];
        }

        return [.. primary.Busy
            .Where(w => w.End > w.Start)
            .Select(w => new GoogleBusyWindow(w.Start.ToUniversalTime(), w.End.ToUniversalTime()))];
    }

    private static async Task<GoogleErrorPayload> ParseErrorAsync(Stream stream, CancellationToken ct)
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<GoogleErrorPayload>(stream, JsonOptions, ct)
                ?? new GoogleErrorPayload("unknown", null);
        }
        catch (JsonException)
        {
            return new GoogleErrorPayload("unknown", null);
        }
    }

    private sealed record GoogleErrorPayload(
        [property: JsonPropertyName("error")] string Error,
        [property: JsonPropertyName("error_description")] string? ErrorDescription);

    private sealed record GoogleTokenResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("scope")] string? Scope,
        [property: JsonPropertyName("token_type")] string? TokenType);

    private sealed record FreeBusyRequest(
        [property: JsonPropertyName("timeMin")] DateTimeOffset TimeMin,
        [property: JsonPropertyName("timeMax")] DateTimeOffset TimeMax,
        [property: JsonPropertyName("items")] IReadOnlyList<FreeBusyItem> Items);

    private sealed record FreeBusyItem([property: JsonPropertyName("id")] string Id);

    private sealed record FreeBusyResponse(
        [property: JsonPropertyName("calendars")] Dictionary<string, FreeBusyCalendar> Calendars);

    private sealed record FreeBusyCalendar(
        [property: JsonPropertyName("busy")] List<FreeBusyWindow>? Busy);

    private sealed record FreeBusyWindow(
        [property: JsonPropertyName("start")] DateTimeOffset Start,
        [property: JsonPropertyName("end")] DateTimeOffset End);
}
