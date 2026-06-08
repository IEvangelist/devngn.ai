// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

internal sealed partial class WellnessClient
{
    // --- Schedule sources -------------------------------------------------

    public async Task<IReadOnlyList<ScheduleSourceResponse>> ListScheduleSourcesAsync(CancellationToken cancellationToken = default) =>
        await SendForJsonAsync<List<ScheduleSourceResponse>>(HttpMethod.Get, "v1/schedule/sources", null, cancellationToken).ConfigureAwait(false);

    public Task<ScheduleSourceResponse?> GetScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonOrNotFoundAsync<ScheduleSourceResponse>(HttpMethod.Get, $"v1/schedule/sources/{id}", null, cancellationToken);

    public Task<ScheduleSourceResponse> CreateScheduleSourceAsync(CreateScheduleSourceRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<ScheduleSourceResponse>(HttpMethod.Post, "v1/schedule/sources", request, cancellationToken);
    }

    public Task<ScheduleSourceResponse> UpdateScheduleSourceAsync(Guid id, UpdateScheduleSourceRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<ScheduleSourceResponse>(HttpMethod.Patch, $"v1/schedule/sources/{id}", request, cancellationToken);
    }

    public Task DeleteScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForStatusAsync(HttpMethod.Delete, $"v1/schedule/sources/{id}", null, cancellationToken);

    public Task<ScheduleSyncResponse> SyncScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonAsync<ScheduleSyncResponse>(HttpMethod.Post, $"v1/schedule/sources/{id}/sync", null, cancellationToken);

    // --- Schedule events --------------------------------------------------

    public async Task<IReadOnlyList<ScheduleEventResponse>> ListScheduleEventsAsync(
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        Guid? sourceId = null,
        CancellationToken cancellationToken = default)
    {
        var query = new QueryStringBuilder()
            .Add("from", from)
            .Add("to", to)
            .Add("sourceId", sourceId?.ToString());

        return await SendForJsonAsync<List<ScheduleEventResponse>>(
            HttpMethod.Get, $"v1/schedule/events{query}", null, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<ScheduleEventResponse>> PushScheduleEventsAsync(PushScheduleEventsRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return await SendForJsonAsync<List<ScheduleEventResponse>>(HttpMethod.Post, "v1/schedule/events", request, cancellationToken).ConfigureAwait(false);
    }

    public Task DeleteScheduleEventAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForStatusAsync(HttpMethod.Delete, $"v1/schedule/events/{id}", null, cancellationToken);

    // --- Gaps -------------------------------------------------------------

    public async Task<IReadOnlyList<GapResponse>> ListGapsAsync(
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        string? timeZone = null,
        CancellationToken cancellationToken = default)
    {
        var query = new QueryStringBuilder()
            .Add("from", from)
            .Add("to", to)
            .Add("tz", timeZone);

        return await SendForJsonAsync<List<GapResponse>>(
            HttpMethod.Get, $"v1/gaps{query}", null, cancellationToken).ConfigureAwait(false);
    }
}
