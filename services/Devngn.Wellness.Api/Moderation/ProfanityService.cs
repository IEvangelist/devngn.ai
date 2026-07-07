// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Json;
using System.Text.Json;
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
    private const string FilterPath = "/profanity/filter";
    private const string ReplacementStrategy = "Asterisk";
    private const string Target = "Body";

    /// <inheritdoc/>
    public async Task<string> SanitizeAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        var result = await SendFilterRequestAsync(text, cancellationToken);
        if (result.ContainsProfanity && result.FilteredText is null)
        {
            logger.LogError("Profanity filter reported profanity but returned no filtered text.");
            throw new ProfanityServiceUnavailableException(
                "Profanity filter service returned an invalid response.");
        }

        return result.FilteredText ?? text;
    }

    /// <inheritdoc/>
    public async Task<bool> IsCleanAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return true;
        }

        var result = await SendFilterRequestAsync(text, cancellationToken);
        return !result.ContainsProfanity;
    }

    private async Task<FilterResult> SendFilterRequestAsync(
        string text,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await http.PostAsJsonAsync(
                FilterPath,
                new FilterRequest(text, ReplacementStrategy, Target),
                cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<FilterResponse>(cancellationToken);
            if (result?.ContainsProfanity is not { } containsProfanity)
            {
                logger.LogError("Profanity filter returned an empty or invalid response.");
                throw new ProfanityServiceUnavailableException(
                    "Profanity filter service returned an invalid response.");
            }

            return new FilterResult(containsProfanity, result.FilteredText);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Profanity filter service unreachable.");
            throw new ProfanityServiceUnavailableException(
                "Profanity filter service is unavailable.", ex);
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            logger.LogError(ex, "Profanity filter returned an unreadable response.");
            throw new ProfanityServiceUnavailableException(
                "Profanity filter service returned an invalid response.", ex);
        }
    }

    private sealed record FilterRequest(string Text, string Strategy, string Target);

    private sealed record FilterResponse(
        [property: JsonPropertyName("containsProfanity")] bool? ContainsProfanity,
        [property: JsonPropertyName("filteredText")] string? FilteredText);

    private sealed record FilterResult(bool ContainsProfanity, string? FilteredText);
}
