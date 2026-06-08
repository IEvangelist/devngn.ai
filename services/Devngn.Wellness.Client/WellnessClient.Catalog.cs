// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

internal sealed partial class WellnessClient
{
    public async Task<IReadOnlyList<ActivityResponse>> ListActivitiesAsync(
        IEnumerable<string>? availableEquipmentTags = null,
        BodyArea? bodyArea = null,
        int? maxDurationSeconds = null,
        CancellationToken cancellationToken = default)
    {
        var tags = availableEquipmentTags as IReadOnlyCollection<string> ?? availableEquipmentTags?.ToArray();
        var hasFilters = tags is { Count: > 0 } || bodyArea is not null || maxDurationSeconds is not null;

        if (hasFilters)
        {
            var query = new QueryStringBuilder()
                .AddEach("availableEquipmentTag", tags)
                .Add("bodyArea", bodyArea)
                .Add("maxDurationSeconds", maxDurationSeconds);

            return await SendForJsonAsync<List<ActivityResponse>>(
                HttpMethod.Get, $"v1/activities{query}", null, cancellationToken).ConfigureAwait(false);
        }

        // Only the unfiltered full catalog is cached; it is identical for every user.
        var cached = await GetOrCreateAsync(
            CatalogCacheKey,
            _options.ActivityCatalogCacheDuration,
            ct => SendForJsonAsync<List<ActivityResponse>>(HttpMethod.Get, "v1/activities", null, ct),
            cancellationToken).ConfigureAwait(false);

        // Defensive copy so a caller can't mutate the shared cached catalog list.
        return new List<ActivityResponse>(cached);
    }
}
