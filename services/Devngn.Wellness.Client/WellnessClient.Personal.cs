// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.Caching.Memory;

namespace Devngn.Wellness.Client;

internal sealed partial class WellnessClient
{
    private static string ProfileCacheKey(string scope) => CacheKeyPrefix + "profile:" + scope;

    private static string EquipmentCacheKey(string scope) => CacheKeyPrefix + "equipment:" + scope;

    // --- Consent ----------------------------------------------------------

    public Task<ConsentStateResponse> GetConsentAsync(CancellationToken cancellationToken = default) =>
        SendForJsonAsync<ConsentStateResponse>(HttpMethod.Get, "v1/consent", null, cancellationToken);

    public Task<ConsentSnapshot> AcceptConsentAsync(AcceptConsentRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<ConsentSnapshot>(HttpMethod.Post, "v1/consent", request, cancellationToken);
    }

    public async Task RevokeConsentAsync(CancellationToken cancellationToken = default)
    {
        // Revoking consent cascades deletion of all wellness data server-side, so any
        // user-scoped cache for this user is now stale and must be dropped. Capture the
        // scope before the call so it can't shift mid-operation.
        var scope = _options.EnableCaching
            ? await GetCacheScopeAsync(cancellationToken).ConfigureAwait(false)
            : null;

        await SendForStatusAsync(HttpMethod.Delete, "v1/consent", null, cancellationToken).ConfigureAwait(false);

        if (scope is not null)
        {
            cache.Remove(ProfileCacheKey(scope));
            cache.Remove(EquipmentCacheKey(scope));
        }
    }

    // --- Profile ----------------------------------------------------------

    public async Task<ProfileResponse?> GetProfileAsync(CancellationToken cancellationToken = default)
    {
        var scope = await GetCacheScopeAsync(cancellationToken).ConfigureAwait(false);
        if (!_options.EnableCaching || scope is null)
        {
            return await SendForJsonOrNotFoundAsync<ProfileResponse>(HttpMethod.Get, "v1/profile", null, cancellationToken).ConfigureAwait(false);
        }

        var key = ProfileCacheKey(scope);
        if (cache.TryGetValue(key, out ProfileResponse? cached) && cached is not null)
        {
            return cached;
        }

        var profile = await SendForJsonOrNotFoundAsync<ProfileResponse>(HttpMethod.Get, "v1/profile", null, cancellationToken).ConfigureAwait(false);
        if (profile is not null)
        {
            cache.Set(key, profile, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = _options.ProfileCacheDuration });
        }

        return profile;
    }

    public async Task<ProfileResponse> UpsertProfileAsync(UpsertProfileRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await SendForJsonAsync<ProfileResponse>(HttpMethod.Put, "v1/profile", request, cancellationToken).ConfigureAwait(false);
        await InvalidateProfileAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    public async Task DeleteProfileAsync(CancellationToken cancellationToken = default)
    {
        await SendForStatusAsync(HttpMethod.Delete, "v1/profile", null, cancellationToken).ConfigureAwait(false);
        await InvalidateProfileAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task InvalidateProfileAsync(CancellationToken cancellationToken)
    {
        if (!_options.EnableCaching)
        {
            return;
        }

        var scope = await GetCacheScopeAsync(cancellationToken).ConfigureAwait(false);
        if (scope is not null)
        {
            cache.Remove(ProfileCacheKey(scope));
        }
    }

    // --- Goals ------------------------------------------------------------

    public async Task<IReadOnlyList<GoalResponse>> ListGoalsAsync(CancellationToken cancellationToken = default) =>
        await SendForJsonAsync<List<GoalResponse>>(HttpMethod.Get, "v1/goals", null, cancellationToken).ConfigureAwait(false);

    public Task<GoalResponse?> GetGoalAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonOrNotFoundAsync<GoalResponse>(HttpMethod.Get, $"v1/goals/{id}", null, cancellationToken);

    public Task<GoalResponse> CreateGoalAsync(CreateGoalRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<GoalResponse>(HttpMethod.Post, "v1/goals", request, cancellationToken);
    }

    public Task<GoalResponse> UpdateGoalAsync(Guid id, UpdateGoalRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<GoalResponse>(HttpMethod.Put, $"v1/goals/{id}", request, cancellationToken);
    }

    public Task DeleteGoalAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForStatusAsync(HttpMethod.Delete, $"v1/goals/{id}", null, cancellationToken);

    // --- Equipment --------------------------------------------------------

    public async Task<IReadOnlyList<EquipmentResponse>> ListEquipmentAsync(CancellationToken cancellationToken = default)
    {
        var scope = await GetCacheScopeAsync(cancellationToken).ConfigureAwait(false);
        if (!_options.EnableCaching || scope is null)
        {
            return await SendForJsonAsync<List<EquipmentResponse>>(HttpMethod.Get, "v1/equipment", null, cancellationToken).ConfigureAwait(false);
        }

        var cached = await GetOrCreateAsync(
            EquipmentCacheKey(scope),
            _options.EquipmentCacheDuration,
            ct => SendForJsonAsync<List<EquipmentResponse>>(HttpMethod.Get, "v1/equipment", null, ct),
            cancellationToken).ConfigureAwait(false);

        // Defensive copy so a caller can't mutate the shared cached list instance.
        return new List<EquipmentResponse>(cached);
    }

    public Task<EquipmentResponse?> GetEquipmentAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonOrNotFoundAsync<EquipmentResponse>(HttpMethod.Get, $"v1/equipment/{id}", null, cancellationToken);

    public async Task<EquipmentResponse> AddEquipmentAsync(CreateEquipmentRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await SendForJsonAsync<EquipmentResponse>(HttpMethod.Post, "v1/equipment", request, cancellationToken).ConfigureAwait(false);
        await InvalidateEquipmentAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    public async Task<EquipmentResponse> UpdateEquipmentAsync(Guid id, UpdateEquipmentRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await SendForJsonAsync<EquipmentResponse>(HttpMethod.Put, $"v1/equipment/{id}", request, cancellationToken).ConfigureAwait(false);
        await InvalidateEquipmentAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    public async Task DeleteEquipmentAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await SendForStatusAsync(HttpMethod.Delete, $"v1/equipment/{id}", null, cancellationToken).ConfigureAwait(false);
        await InvalidateEquipmentAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task InvalidateEquipmentAsync(CancellationToken cancellationToken)
    {
        if (!_options.EnableCaching)
        {
            return;
        }

        var scope = await GetCacheScopeAsync(cancellationToken).ConfigureAwait(false);
        if (scope is not null)
        {
            cache.Remove(EquipmentCacheKey(scope));
        }
    }
}
