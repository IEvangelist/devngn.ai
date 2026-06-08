// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Devngn.Wellness.Api.Schedule;

internal static class ScheduleEventEndpoints
{
    /// <summary>Maximum window the windowed-list endpoint will read back in one call.</summary>
    public static readonly TimeSpan MaxQueryWindow = TimeSpan.FromDays(30);

    /// <summary>Default look-ahead when callers omit <c>from</c>/<c>to</c>.</summary>
    public static readonly TimeSpan DefaultQueryWindow = TimeSpan.FromHours(24);

    /// <summary>EF-generated index name for (SourceId, ExternalId) uniqueness; see ScheduleEventConfiguration.</summary>
    public const string UniqueExternalIdIndexName = "IX_schedule_events_SourceId_ExternalId";

    public static IEndpointRouteBuilder MapScheduleEventEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/schedule/events")
            .WithTags("ScheduleEvents")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync)
            .Produces<IReadOnlyList<ScheduleEventResponse>>()
            .ProducesValidationProblem()
            .WithName("ListScheduleEvents");
        group.MapPost("", PushAsync)
            .ValidateBody<RouteHandlerBuilder, PushScheduleEventsRequest>()
            .Produces<IReadOnlyList<ScheduleEventResponse>>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesValidationProblem()
            .WithName("PushScheduleEvents");
        group.MapDelete("{id:guid}", DeleteAsync)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound)
            .WithName("DeleteScheduleEvent");

        return app;
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? sourceId,
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

        var userId = currentUser.UserId!.Value;
        var query = db.ScheduleEvents
            .AsNoTracking()
            .Where(e => e.UserId == userId &&
                        e.EndUtc > rangeStart &&
                        e.StartUtc < rangeEnd);

        if (sourceId is { } sid)
        {
            query = query.Where(e => e.SourceId == sid);
        }

        var rows = await query
            .OrderBy(e => e.StartUtc)
            .Select(e => new ScheduleEventResponse(e.Id, e.SourceId, e.ExternalId, e.StartUtc, e.EndUtc, e.Busy))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult> PushAsync(
        [FromBody] PushScheduleEventsRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        // Validate windows up front so a single bad item rejects the batch deterministically
        // rather than hitting Postgres and seeing a CHECK violation buried in a 23514 error.
        var problems = new Dictionary<string, string[]>();
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            if (item.StartUtc >= item.EndUtc)
            {
                problems[$"items[{i}].endUtc"] = ["EndUtc must be strictly greater than StartUtc."];
            }
            if (item.StartUtc.Offset != TimeSpan.Zero)
            {
                problems[$"items[{i}].startUtc"] = ["StartUtc must be expressed in UTC (offset 00:00)."];
            }
            if (item.EndUtc.Offset != TimeSpan.Zero)
            {
                problems[$"items[{i}].endUtc"] = ["EndUtc must be expressed in UTC (offset 00:00)."];
            }
        }
        if (problems.Count > 0)
        {
            return Results.ValidationProblem(problems);
        }

        // Reject duplicate externalIds within the same batch — the unique index would
        // catch this at SaveChanges time but we'd lose per-item context.
        var duplicate = request.Items
            .GroupBy(i => i.ExternalId, StringComparer.Ordinal)
            .FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["items"] = [$"Duplicate externalId '{duplicate.Key}' within batch."],
            });
        }

        var source = await db.ScheduleSources
            .Where(s => s.Id == request.SourceId && s.UserId == userId)
            .Select(s => new { s.Type, s.ConnectionStatus })
            .SingleOrDefaultAsync(ct);
        if (source is null)
        {
            return Results.NotFound();
        }

        // Direct push is for user-owned sources only. Provider-driven sources mutate
        // through the sync pipeline; mixing the two would clobber freshly-synced free/busy.
        if (source.Type != ScheduleSourceType.User)
        {
            return Results.Problem(
                title: "wrong_source_type",
                detail: "Direct event push is only allowed for sources of type 'User'.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (source.ConnectionStatus == ScheduleSourceConnectionStatus.Disabled)
        {
            return Results.Problem(
                title: "source_disabled",
                detail: "Resume the source via PATCH before pushing events.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var existingByExternalId = await db.ScheduleEvents
            .Where(e => e.SourceId == request.SourceId &&
                        e.ExternalId != null &&
                        request.Items.Select(i => i.ExternalId).Contains(e.ExternalId))
            .ToDictionaryAsync(e => e.ExternalId!, e => e, StringComparer.Ordinal, ct);

        var responses = new List<ScheduleEventResponse>(request.Items.Count);
        foreach (var item in request.Items)
        {
            if (existingByExternalId.TryGetValue(item.ExternalId, out var existing))
            {
                existing.StartUtc = item.StartUtc.ToUniversalTime();
                existing.EndUtc = item.EndUtc.ToUniversalTime();
                existing.Busy = item.Busy;
                responses.Add(new ScheduleEventResponse(existing.Id, existing.SourceId, existing.ExternalId, existing.StartUtc, existing.EndUtc, existing.Busy));
            }
            else
            {
                var fresh = new ScheduleEvent
                {
                    SourceId = request.SourceId,
                    UserId = userId,
                    ExternalId = item.ExternalId,
                    StartUtc = item.StartUtc.ToUniversalTime(),
                    EndUtc = item.EndUtc.ToUniversalTime(),
                    Busy = item.Busy,
                };
                db.ScheduleEvents.Add(fresh);
                responses.Add(new ScheduleEventResponse(fresh.Id, fresh.SourceId, fresh.ExternalId, fresh.StartUtc, fresh.EndUtc, fresh.Busy));
            }
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsExternalIdConflict(ex))
        {
            // Race against a concurrent push of the same externalId. Caller can retry —
            // the second attempt will read the now-existing row and upsert.
            return Results.Conflict(new
            {
                error = "duplicate_external_id",
                message = "Another writer inserted an event with the same externalId; retry the push.",
            });
        }

        return Results.Ok(responses);
    }

    private static async Task<IResult> DeleteAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.ScheduleEvents
            .Where(e => e.Id == id && e.UserId == userId)
            .ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static bool IsExternalIdConflict(DbUpdateException ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is PostgresException pg &&
                pg.SqlState == "23505" &&
                string.Equals(pg.ConstraintName, UniqueExternalIdIndexName, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }
}
