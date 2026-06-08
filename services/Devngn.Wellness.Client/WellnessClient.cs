// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Client;

/// <summary>
/// Default <see cref="IWellnessClient"/> implementation. Resolves the named
/// <c>wellness-api</c> <see cref="HttpClient"/> from <see cref="IHttpClientFactory"/> per call
/// (so it inherits the configured base address, auth handler, and resilience pipeline) and
/// caches stable reads in <see cref="IMemoryCache"/>.
/// </summary>
internal sealed partial class WellnessClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    IOptions<WellnessClientOptions> options) : IWellnessClient
{
    private const string CacheKeyPrefix = "devngn.wellness:";
    private const string CatalogCacheKey = CacheKeyPrefix + "catalog";

    private static readonly JsonSerializerOptions s_jsonOptions = CreateJsonOptions();

    private readonly WellnessClientOptions _options = options.Value;

    internal static JsonSerializerOptions JsonOptions => s_jsonOptions;

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        json.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
        return json;
    }

    private HttpClient CreateClient() =>
        httpClientFactory.CreateClient(WellnessClientServiceCollectionExtensions.HttpClientName);

    // --- HTTP helpers -----------------------------------------------------

    private async Task<HttpResponseMessage> SendCoreAsync(
        HttpMethod method,
        string relativeUri,
        object? body,
        CancellationToken cancellationToken)
    {
        var client = CreateClient();
        using var request = new HttpRequestMessage(method, relativeUri);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), mediaType: null, s_jsonOptions);
        }

        return await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T> SendForJsonAsync<T>(
        HttpMethod method,
        string relativeUri,
        object? body,
        CancellationToken cancellationToken)
    {
        using var response = await SendCoreAsync(method, relativeUri, body, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        return await ReadRequiredAsync<T>(response, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T?> SendForJsonOrNotFoundAsync<T>(
        HttpMethod method,
        string relativeUri,
        object? body,
        CancellationToken cancellationToken)
        where T : class
    {
        using var response = await SendCoreAsync(method, relativeUri, body, cancellationToken).ConfigureAwait(false);
        if (response.StatusCode is HttpStatusCode.NotFound)
        {
            return null;
        }

        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        return await ReadRequiredAsync<T>(response, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T?> SendForJsonOrNoContentAsync<T>(
        HttpMethod method,
        string relativeUri,
        object? body,
        CancellationToken cancellationToken)
        where T : class
    {
        using var response = await SendCoreAsync(method, relativeUri, body, cancellationToken).ConfigureAwait(false);
        if (response.StatusCode is HttpStatusCode.NoContent)
        {
            return null;
        }

        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        return await ReadRequiredAsync<T>(response, cancellationToken).ConfigureAwait(false);
    }

    private async Task SendForStatusAsync(
        HttpMethod method,
        string relativeUri,
        object? body,
        CancellationToken cancellationToken)
    {
        using var response = await SendCoreAsync(method, relativeUri, body, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        string? responseBody = null;
        try
        {
            responseBody = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            // Best-effort body capture; fall through with a null body.
        }

        var request = response.RequestMessage;
        throw new WellnessApiException(
            response.StatusCode,
            $"The wellness API returned {(int)response.StatusCode} ({response.ReasonPhrase}) for " +
            $"{request?.Method} {request?.RequestUri}.",
            responseBody);
    }

    private static async Task<T> ReadRequiredAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var value = await response.Content
            .ReadFromJsonAsync<T>(s_jsonOptions, cancellationToken)
            .ConfigureAwait(false);

        if (value is null)
        {
            throw new WellnessApiException(
                response.StatusCode,
                $"The wellness API returned an empty body where a '{typeof(T).Name}' was expected.");
        }

        return value;
    }

    // --- Cache helpers ----------------------------------------------------

    private ValueTask<string?> GetCacheScopeAsync(CancellationToken cancellationToken) =>
        _options.CacheScopeProvider?.Invoke(cancellationToken) ?? new ValueTask<string?>((string?)null);

    private async Task<T> GetOrCreateAsync<T>(
        string cacheKey,
        TimeSpan ttl,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken)
    {
        if (!_options.EnableCaching)
        {
            return await factory(cancellationToken).ConfigureAwait(false);
        }

        if (cache.TryGetValue(cacheKey, out T? cached) && cached is not null)
        {
            return cached;
        }

        var value = await factory(cancellationToken).ConfigureAwait(false);
        cache.Set(cacheKey, value, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl });
        return value;
    }
}
