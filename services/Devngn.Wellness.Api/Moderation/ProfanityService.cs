// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Devngn.Wellness.Api.Moderation;

/// <summary>
/// HTTP client that calls the <c>profanity-filter</c> sidecar (Aspire service-discovery name)
/// to sanitize or validate user-supplied text. Implements <see cref="IProfanityService"/>
/// so callers are decoupled from the HTTP details and tests can inject a mock.
/// </summary>
internal sealed class ProfanityService(
    HttpClient http,
    ILogger<ProfanityService> logger) : IProfanityService
{
    /// <inheritdoc/>
    public async Task<string> SanitizeAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        try
        {
            var response = await http.PostAsJsonAsync(
                "/filter",
                new FilterRequest(text, "asterisk"),
                cancellationToken);

            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<FilterResponse>(cancellationToken);
            return result?.Text ?? text;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Profanity filter service unreachable; returning original text.");
            return text;
        }
    }

    /// <inheritdoc/>
    public async Task<bool> IsCleanAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return true;
        }

        try
        {
            var response = await http.PostAsJsonAsync(
                "/filter",
                new FilterRequest(text, "asterisk"),
                cancellationToken);

            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<FilterResponse>(cancellationToken);
            return result?.NoSwearWords ?? true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Profanity filter service unreachable; assuming text is clean.");
            return true;
        }
    }

    private sealed record FilterRequest(string Text, string Strategy);

    private sealed record FilterResponse(
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("noSwearWords")] bool NoSwearWords);
}
