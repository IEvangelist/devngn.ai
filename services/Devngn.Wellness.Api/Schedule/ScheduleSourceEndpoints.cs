// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Schedule.Google;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Schedule;

internal static class ScheduleSourceEndpoints
{
    public static IEndpointRouteBuilder MapScheduleSourceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/schedule/sources")
            .WithTags("ScheduleSources")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync).WithName("ListScheduleSources");
        group.MapGet("{id:guid}", GetAsync).WithName("GetScheduleSource");
        group.MapPost("", CreateAsync)
            .ValidateBody<RouteHandlerBuilder, CreateScheduleSourceRequest>()
            .WithName("CreateScheduleSource");
        group.MapPatch("{id:guid}", PatchAsync)
            .ValidateBody<RouteHandlerBuilder, UpdateScheduleSourceRequest>()
            .WithName("UpdateScheduleSource");
        group.MapDelete("{id:guid}", DeleteAsync).WithName("DeleteScheduleSource");
        group.MapPost("{id:guid}/sync", SyncAsync).WithName("SyncScheduleSource");

        return app;
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.ScheduleSources
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .OrderBy(s => s.CreatedAt)
            .Select(s => Map(s))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var row = await db.ScheduleSources
            .AsNoTracking()
            .Where(s => s.Id == id && s.UserId == userId)
            .Select(s => Map(s))
            .SingleOrDefaultAsync(ct);
        return row is null ? Results.NotFound() : Results.Ok(row);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] CreateScheduleSourceRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        // OAuth sources are minted by /v1/schedule/connect/{provider} (phase 7b/c)
        // which captures and encrypts a refresh token. Letting clients POST a bare
        // "google"/"microsoft" source here would leave a row that can never sync.
        if (request.Type != ScheduleSourceType.User)
        {
            return Results.Problem(
                title: "oauth_required",
                detail: "Google and Microsoft schedule sources are created via /v1/schedule/connect/{provider}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var userId = currentUser.UserId!.Value;
        var entity = new ScheduleSource
        {
            UserId = userId,
            Type = ScheduleSourceType.User,
            DisplayName = request.DisplayName.Trim(),
            ConnectionStatus = ScheduleSourceConnectionStatus.Connected,
            IsEnabled = true,
            CreatedAt = clock.GetUtcNow(),
        };
        db.ScheduleSources.Add(entity);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/v1/schedule/sources/{entity.Id}", Map(entity));
    }

    private static async Task<IResult> PatchAsync(
        Guid id,
        [FromBody] UpdateScheduleSourceRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var entity = await db.ScheduleSources.SingleOrDefaultAsync(s => s.Id == id && s.UserId == userId, ct);
        if (entity is null)
        {
            return Results.NotFound();
        }

        if (request.DisplayName is { } name)
        {
            entity.DisplayName = name.Trim();
        }

        if (request.ConnectionStatus is { } status)
        {
            if (status is not (ScheduleSourceConnectionStatus.Connected or ScheduleSourceConnectionStatus.Disabled))
            {
                return Results.Problem(
                    title: "invalid_status_transition",
                    detail: "Only 'Connected' (resume) and 'Disabled' (pause) are settable via PATCH.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            // Resuming after the sync pipeline parked the source in NeedsReconnect
            // requires the OAuth connect flow, not a status flip — we'd silently no-op
            // syncs otherwise.
            if (status == ScheduleSourceConnectionStatus.Connected &&
                entity.ConnectionStatus == ScheduleSourceConnectionStatus.NeedsReconnect)
            {
                return Results.Problem(
                    title: "reconnect_required",
                    detail: "Source is in NeedsReconnect; re-run the OAuth connect flow to restore it.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            entity.ConnectionStatus = status;
            entity.IsEnabled = status == ScheduleSourceConnectionStatus.Connected;
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(Map(entity));
    }

    private static async Task<IResult> DeleteAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.ScheduleSources.Where(s => s.Id == id && s.UserId == userId).ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> SyncAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        GoogleScheduleSyncService googleSync,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        // Dispatch by source type so the same endpoint serves whichever provider the
        // user owns. Microsoft sync arrives in phase 7c and slots in here.
        var type = await db.ScheduleSources
            .Where(s => s.Id == id && s.UserId == userId)
            .Select(s => (ScheduleSourceType?)s.Type)
            .SingleOrDefaultAsync(ct);
        if (type is null)
        {
            return Results.NotFound();
        }

        ScheduleSyncResult result = type switch
        {
            ScheduleSourceType.Google => await googleSync.SyncAsync(id, userId, ct),
            ScheduleSourceType.User => new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0, "user_source_not_syncable"),
            ScheduleSourceType.Microsoft => new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0, "microsoft_not_implemented"),
            _ => new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0, "unknown_provider"),
        };

        return result.Outcome switch
        {
            ScheduleSyncOutcome.Success => Results.Ok(new { synced = result.EventCount }),
            ScheduleSyncOutcome.NotFound => Results.NotFound(),
            ScheduleSyncOutcome.LockHeld => Results.Problem(
                title: "sync_in_progress",
                detail: "A sync is already running for this source.",
                statusCode: StatusCodes.Status409Conflict),
            ScheduleSyncOutcome.Disabled => Results.Problem(
                title: "source_disabled",
                detail: "The source is disabled; re-enable it via PATCH before syncing.",
                statusCode: StatusCodes.Status409Conflict),
            ScheduleSyncOutcome.NeedsReconnect => Results.Problem(
                title: "needs_reconnect",
                detail: $"Source needs reconnection ({result.ErrorCode}).",
                statusCode: StatusCodes.Status422UnprocessableEntity),
            ScheduleSyncOutcome.TransientFailure => Results.Problem(
                title: "sync_transient_failure",
                detail: $"Sync failed transiently ({result.ErrorCode}); retry later.",
                statusCode: StatusCodes.Status503ServiceUnavailable),
            _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError),
        };
    }

    internal static ScheduleSourceResponse Map(ScheduleSource s) => new(
        s.Id, s.Type, s.DisplayName, s.ConnectionStatus, s.Scope,
        s.LastSyncAt, s.LastRefreshAt, s.LastSyncErrorCode, s.LastSyncErrorAt, s.CreatedAt);
}
