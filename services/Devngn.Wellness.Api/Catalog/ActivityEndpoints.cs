// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Catalog;

internal static class ActivityEndpoints
{
    public static IEndpointRouteBuilder MapActivityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/activities")
            .WithTags("Activities")
            .RequireAuthorization();

        group.MapGet("", ListAsync)
            .Produces<IReadOnlyList<ActivityResponse>>()
            .ProducesValidationProblem()
            .WithName("ListActivities");
        return app;
    }

    /// <summary>
    /// Catalog browse endpoint. All filters are optional; when omitted, returns the full
    /// catalog. Sort order is stable (<c>DurationSeconds, Slug</c>) so the response can
    /// be diffed across calls.
    /// </summary>
    /// <param name="availableEquipmentTag">
    /// The set of equipment the caller has on hand. When supplied, an activity matches
    /// only if every one of its <see cref="Activity.EquipmentTags"/> is present in this
    /// set (subset semantics). Empty-tag activities (no equipment needed) always match.
    /// When omitted entirely, no equipment filter is applied.
    /// </param>
    /// <param name="bodyArea">Optional exact-match filter on <see cref="Activity.BodyArea"/>.</param>
    /// <param name="maxDurationSeconds">Optional upper bound on <see cref="Activity.DurationSeconds"/>.</param>
    private static async Task<IResult> ListAsync(
        WellnessDbContext db,
        [FromQuery] string[]? availableEquipmentTag,
        [FromQuery] BodyArea? bodyArea,
        [FromQuery] int? maxDurationSeconds,
        CancellationToken ct)
    {
        if (maxDurationSeconds is <= 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(maxDurationSeconds)] = ["maxDurationSeconds must be > 0."],
            });
        }

        // Coarse filters that EF can translate; equipment-subset filtering happens in
        // memory below to avoid Npgsql array-translation surprises and because the
        // catalog is tiny (≈12 rows).
        var query = db.Activities.AsNoTracking();
        if (bodyArea is { } area)
        {
            query = query.Where(a => a.BodyArea == area);
        }
        if (maxDurationSeconds is { } cap)
        {
            query = query.Where(a => a.DurationSeconds <= cap);
        }

        var rows = await query
            .OrderBy(a => a.DurationSeconds)
            .ThenBy(a => a.Slug)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        HashSet<string>? available = null;
        if (availableEquipmentTag is { Length: > 0 })
        {
            available = new HashSet<string>(StringComparer.Ordinal);
            foreach (var tag in availableEquipmentTag)
            {
                if (!string.IsNullOrWhiteSpace(tag))
                {
                    available.Add(tag.Trim().ToLowerInvariant());
                }
            }
        }

        var result = new List<ActivityResponse>(rows.Count);
        foreach (var a in rows)
        {
            if (available is not null && !IsSubset(a.EquipmentTags, available))
            {
                continue;
            }
            result.Add(ToResponse(a));
        }

        return Results.Ok(result);
    }

    private static bool IsSubset(IReadOnlyList<string> required, HashSet<string> available)
    {
        for (var i = 0; i < required.Count; i++)
        {
            if (!available.Contains(required[i]))
            {
                return false;
            }
        }
        return true;
    }

    private static ActivityResponse ToResponse(Activity a) => new(
        a.Id,
        a.Slug,
        a.Title,
        a.Description,
        a.BodyArea,
        a.Intensity,
        a.DurationSeconds,
        a.EquipmentTags,
        a.AnimationProvider,
        a.AnimationAssetId,
        a.LicenseAttribution);
}

/// <summary>Wire response shape for <c>GET /v1/activities</c>.</summary>
public sealed record ActivityResponse(
    Guid Id,
    string Slug,
    string Title,
    string Description,
    BodyArea BodyArea,
    IntensityLevel Intensity,
    int DurationSeconds,
    string[] EquipmentTags,
    string AnimationProvider,
    string AnimationAssetId,
    string? LicenseAttribution);
