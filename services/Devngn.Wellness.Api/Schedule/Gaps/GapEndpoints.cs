// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Gaps;

internal static class GapEndpoints
{
    /// <summary>Hard upper bound on the query window. Matches the schedule sync horizon.</summary>
    public static readonly TimeSpan MaxQueryWindow = TimeSpan.FromDays(14);

    /// <summary>Default look-ahead when callers omit <c>from</c>/<c>to</c>.</summary>
    public static readonly TimeSpan DefaultQueryWindow = TimeSpan.FromHours(24);

    public static IEndpointRouteBuilder MapGapEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/gaps")
            .WithTags("Gaps")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync).WithName("ListGaps");
        return app;
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        IGapDetector detector,
        IOptions<GapDetectionOptions> options,
        TimeProvider clock,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rangeStart = (from ?? now).ToUniversalTime();
        var rangeEnd = (to ?? rangeStart + DefaultQueryWindow).ToUniversalTime();

        if (rangeEnd <= rangeStart)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["to"] = ["Query 'to' must be greater than 'from'."],
            });
        }

        if (rangeEnd - rangeStart > MaxQueryWindow)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["to"] = [$"Query window cannot exceed {MaxQueryWindow.TotalDays} days."],
            });
        }

        TimeZoneInfo userTz;
        try
        {
            userTz = string.IsNullOrWhiteSpace(tz)
                ? TimeZoneInfo.Utc
                : TimeZoneInfo.FindSystemTimeZoneById(tz);
        }
        catch (TimeZoneNotFoundException)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["tz"] = [$"Unknown time zone '{tz}'. Use an IANA name (e.g. 'America/New_York') or omit for UTC."],
            });
        }
        catch (InvalidTimeZoneException)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["tz"] = [$"Time zone '{tz}' is corrupted on this host."],
            });
        }

        var userId = currentUser.UserId!.Value;

        // Disabled sources don't contribute to busy time. Free events aren't
        // persisted today (phase 7 only stores busy windows), but we filter
        // defensively in case that ever changes.
        var rows = await (
            from e in db.ScheduleEvents.AsNoTracking()
            join s in db.ScheduleSources.AsNoTracking() on e.SourceId equals s.Id
            where e.UserId == userId
                && e.Busy
                && s.ConnectionStatus != ScheduleSourceConnectionStatus.Disabled
                && e.EndUtc > rangeStart
                && e.StartUtc < rangeEnd
            select new { e.StartUtc, e.EndUtc }
        ).ToListAsync(ct);

        var busy = rows.ConvertAll(r => new BusyInterval(r.StartUtc, r.EndUtc));

        // Cooldown source: prompts delivered within one cooldown window before the
        // query range. The detector advances each candidate gap's start past the
        // cooldown after the most recent of these, so a user who was just prompted
        // sees their next gap shifted instead of getting nagged again immediately.
        var cooldownLookback = TimeSpan.FromMinutes(options.Value.PromptCooldownMinutes);
        var recentPrompts = await db.Prompts
            .AsNoTracking()
            .Where(p => p.UserId == userId
                && p.DeliveredAt >= rangeStart - cooldownLookback
                && p.DeliveredAt < rangeEnd)
            .OrderBy(p => p.DeliveredAt)
            .Select(p => p.DeliveredAt)
            .ToListAsync(ct);

        var gaps = detector.Detect(busy, rangeStart, rangeEnd, recentPrompts, userTz, options.Value, now);
        var response = gaps.Select(g => new GapResponse(g.StartUtc, g.EndUtc, g.DurationMinutes)).ToList();
        return Results.Ok(response);
    }
}

public sealed record GapResponse(DateTimeOffset StartUtc, DateTimeOffset EndUtc, int DurationMinutes);
