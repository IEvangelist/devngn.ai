// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Microsoft;

/// <summary>
/// Orchestrates one sync pass for a Microsoft-backed <see cref="ScheduleSource"/>. Same
/// pattern as <see cref="Google.GoogleScheduleSyncService"/>: take an advisory lock,
/// refresh the access token, fetch busy windows, window-replace events, rotate the
/// stored refresh token only when Microsoft issues a new one. Idempotent.
/// </summary>
internal sealed class MicrosoftScheduleSyncService(
    WellnessDbContext db,
    IMicrosoftCalendarClient microsoft,
    IRefreshTokenProtector protector,
    IOptions<MicrosoftCalendarOptions> options,
    TimeProvider clock,
    ILogger<MicrosoftScheduleSyncService> logger)
{
    public async Task<ScheduleSyncResult> SyncAsync(Guid sourceId, Guid userId, CancellationToken ct)
    {
        var preflight = await db.ScheduleSources
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == sourceId && s.UserId == userId, ct);
        if (preflight is null)
        {
            return new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0);
        }

        if (preflight.Type != ScheduleSourceType.Microsoft)
        {
            return new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0, "wrong_provider");
        }

        if (!preflight.IsEnabled || preflight.ConnectionStatus == ScheduleSourceConnectionStatus.Disabled)
        {
            return new ScheduleSyncResult(ScheduleSyncOutcome.Disabled, 0, "source_disabled");
        }

        if (preflight.ConnectionStatus == ScheduleSourceConnectionStatus.NeedsReconnect)
        {
            return new ScheduleSyncResult(ScheduleSyncOutcome.NeedsReconnect, 0, "needs_reconnect");
        }

        if (string.IsNullOrEmpty(preflight.ProtectedRefreshToken))
        {
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "missing_refresh_token", deleteFutureFromUtc: null, ct);
        }

        string plaintextRefreshToken;
        try
        {
            plaintextRefreshToken = protector.Unprotect(preflight.ProtectedRefreshToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to unprotect refresh token for Microsoft source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "protector_failed", deleteFutureFromUtc: null, ct);
        }

        // Call Microsoft OUTSIDE the EF execution strategy — strategy retries would
        // duplicate refresh-token exchanges and Microsoft would invalidate one.
        MicrosoftTokenResult token;
        try
        {
            token = await microsoft.RefreshAccessTokenAsync(plaintextRefreshToken, ct);
        }
        catch (MicrosoftInvalidGrantException)
        {
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "invalid_grant", deleteFutureFromUtc: clock.GetUtcNow(), ct);
        }
        catch (MicrosoftTransientException ex)
        {
            logger.LogWarning(ex, "Transient failure refreshing Microsoft token for source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.Error, "transient_token", deleteFutureFromUtc: null, ct);
        }

        var opts = options.Value;
        var syncStart = clock.GetUtcNow();
        var syncEnd = syncStart.Add(opts.SyncWindow);

        IReadOnlyList<MicrosoftBusyWindow> busy;
        try
        {
            busy = await microsoft.QueryBusyWindowsAsync(token.AccessToken, syncStart, syncEnd, ct);
        }
        catch (MicrosoftInvalidGrantException)
        {
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "invalid_grant", deleteFutureFromUtc: syncStart, ct);
        }
        catch (MicrosoftForbiddenException)
        {
            // Tenant policy / conditional access / scope dropped on consent. Mark Error,
            // NOT NeedsReconnect — the refresh token is still valid and reconnecting
            // would change nothing. Don't delete future events.
            logger.LogWarning("Microsoft Graph forbade calendarView for source {SourceId} — likely tenant policy.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.Error, "forbidden", deleteFutureFromUtc: null, ct);
        }
        catch (MicrosoftTransientException ex)
        {
            logger.LogWarning(ex, "Transient failure querying Microsoft calendarView for source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.Error, "transient_calendar", deleteFutureFromUtc: null, ct);
        }

        // Microsoft sometimes returns the same refresh_token on refresh and sometimes
        // omits it entirely. Only persist a rotated token if it's BOTH non-null AND
        // genuinely different — otherwise we'd churn the encrypted blob for nothing.
        var rotatedRefreshToken = !string.IsNullOrEmpty(token.RefreshToken) &&
            !string.Equals(token.RefreshToken, plaintextRefreshToken, StringComparison.Ordinal)
            ? token.RefreshToken
            : null;

        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync<(Guid sourceId, Guid userId, MicrosoftTokenResult token, IReadOnlyList<MicrosoftBusyWindow> busy, string? rotated, DateTimeOffset syncStart, DateTimeOffset syncEnd),
            ScheduleSyncResult>(
            (sourceId, userId, token, busy, rotatedRefreshToken, syncStart, syncEnd),
            PersistSyncAsync,
            verifySucceeded: null,
            cancellationToken: ct);
    }

    private async Task<ScheduleSyncResult> PersistSyncAsync(
        DbContext _,
        (Guid sourceId, Guid userId, MicrosoftTokenResult token, IReadOnlyList<MicrosoftBusyWindow> busy, string? rotated, DateTimeOffset syncStart, DateTimeOffset syncEnd) ctx,
        CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var advisoryKey = ToAdvisoryKey(ctx.sourceId);
        if (!await TryAcquireAdvisoryLockAsync(advisoryKey, ct))
        {
            await tx.RollbackAsync(ct);
            return new ScheduleSyncResult(ScheduleSyncOutcome.LockHeld, 0, "sync_in_progress");
        }

        var source = await db.ScheduleSources
            .SingleOrDefaultAsync(s => s.Id == ctx.sourceId && s.UserId == ctx.userId, ct);
        if (source is null)
        {
            await tx.RollbackAsync(ct);
            return new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0);
        }

        if (ctx.rotated is not null)
        {
            source.ProtectedRefreshToken = protector.Protect(ctx.rotated);
        }
        if (!string.IsNullOrEmpty(ctx.token.GrantedScope))
        {
            source.Scope = ctx.token.GrantedScope;
        }
        source.LastRefreshAt = clock.GetUtcNow();

        await db.ScheduleEvents
            .Where(e => e.SourceId == ctx.sourceId &&
                        e.EndUtc > ctx.syncStart &&
                        e.StartUtc < ctx.syncEnd)
            .ExecuteDeleteAsync(ct);

        var ingestedAt = clock.GetUtcNow();
        foreach (var window in ctx.busy)
        {
            db.ScheduleEvents.Add(new ScheduleEvent
            {
                UserId = source.UserId,
                SourceId = source.Id,
                StartUtc = window.StartUtc,
                EndUtc = window.EndUtc,
                Busy = true,
                ExternalId = null,
                IngestedAt = ingestedAt,
            });
        }

        source.ConnectionStatus = ScheduleSourceConnectionStatus.Connected;
        source.LastSyncAt = ingestedAt;
        source.LastSyncErrorCode = null;
        source.LastSyncErrorAt = null;

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new ScheduleSyncResult(ScheduleSyncOutcome.Success, ctx.busy.Count);
    }

    private async Task<ScheduleSyncResult> PersistTerminalAsync(
        Guid sourceId,
        Guid userId,
        ScheduleSourceConnectionStatus status,
        string code,
        DateTimeOffset? deleteFutureFromUtc,
        CancellationToken ct)
    {
        var outcome = status switch
        {
            ScheduleSourceConnectionStatus.NeedsReconnect => ScheduleSyncOutcome.NeedsReconnect,
            ScheduleSourceConnectionStatus.Error => ScheduleSyncOutcome.TransientFailure,
            _ => ScheduleSyncOutcome.TransientFailure,
        };

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync<(Guid sourceId, Guid userId, ScheduleSourceConnectionStatus status, string code, DateTimeOffset? deleteFutureFromUtc), int>(
            (sourceId, userId, status, code, deleteFutureFromUtc),
            async (_, ctx, innerCt) =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(innerCt);
                var src = await db.ScheduleSources
                    .SingleOrDefaultAsync(s => s.Id == ctx.sourceId && s.UserId == ctx.userId, innerCt);
                if (src is null)
                {
                    await tx.RollbackAsync(innerCt);
                    return 0;
                }
                src.ConnectionStatus = ctx.status;
                src.LastSyncErrorCode = ctx.code;
                src.LastSyncErrorAt = clock.GetUtcNow();

                if (ctx.deleteFutureFromUtc is { } cutoff)
                {
                    await db.ScheduleEvents
                        .Where(e => e.SourceId == ctx.sourceId && e.EndUtc > cutoff)
                        .ExecuteDeleteAsync(innerCt);
                }

                await db.SaveChangesAsync(innerCt);
                await tx.CommitAsync(innerCt);
                return 1;
            },
            verifySucceeded: null,
            cancellationToken: ct);

        return new ScheduleSyncResult(outcome, 0, code);
    }

    private async Task<bool> TryAcquireAdvisoryLockAsync(long key, CancellationToken ct)
    {
        var result = await db.Database
            .SqlQueryRaw<bool>("SELECT pg_try_advisory_xact_lock({0}) AS \"Value\"", key)
            .ToListAsync(ct);
        return result.Count == 1 && result[0];
    }

    /// <summary>
    /// XOR-folds the 16 bytes of a Guid into a 64-bit advisory lock key. Same approach
    /// as the Google sync service so the key spaces stay independent (different sourceIds
    /// for different providers can't collide because they live in disjoint Guid space).
    /// </summary>
    internal static long ToAdvisoryKey(Guid id)
    {
        Span<byte> bytes = stackalloc byte[16];
        _ = id.TryWriteBytes(bytes);
        var high = BitConverter.ToInt64(bytes[..8]);
        var low = BitConverter.ToInt64(bytes[8..]);
        return high ^ low;
    }
}
