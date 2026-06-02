// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Google;

public enum ScheduleSyncOutcome
{
    Success,
    NotFound,
    LockHeld,
    NeedsReconnect,
    TransientFailure,
    Disabled,
}

public sealed record ScheduleSyncResult(
    ScheduleSyncOutcome Outcome,
    int EventCount,
    string? ErrorCode = null);

/// <summary>
/// Orchestrates one sync pass for a Google-backed <see cref="ScheduleSource"/>: takes a
/// PG advisory lock to serialize concurrent syncs for the same source, decrypts the
/// refresh token, refreshes the access token, fetches free/busy, and window-replaces
/// the source's events. Idempotent.
/// </summary>
internal sealed class GoogleScheduleSyncService(
    WellnessDbContext db,
    IGoogleCalendarClient google,
    IRefreshTokenProtector protector,
    IOptions<GoogleCalendarOptions> options,
    TimeProvider clock,
    ILogger<GoogleScheduleSyncService> logger)
{
    public async Task<ScheduleSyncResult> SyncAsync(Guid sourceId, Guid userId, CancellationToken ct)
    {
        // Step 1: preflight read — no transaction needed; just want to bail early on
        // states that don't merit calling Google.
        var preflight = await db.ScheduleSources
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == sourceId && s.UserId == userId, ct);
        if (preflight is null)
        {
            return new ScheduleSyncResult(ScheduleSyncOutcome.NotFound, 0);
        }

        if (preflight.Type != ScheduleSourceType.Google)
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
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "missing_refresh_token", deleteFutureFromUtc: null, ct: ct);
        }

        // Step 2: decrypt refresh token (no DB or network).
        string plaintextRefreshToken;
        try
        {
            plaintextRefreshToken = protector.Unprotect(preflight.ProtectedRefreshToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to unprotect refresh token for source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "protector_failed", deleteFutureFromUtc: null, ct: ct);
        }

        // Step 3: call Google. NEVER inside the EF execution strategy — strategy retries
        // would duplicate refresh-token exchanges and Google would invalidate one.
        GoogleTokenResult token;
        try
        {
            token = await google.RefreshAccessTokenAsync(plaintextRefreshToken, ct);
        }
        catch (GoogleInvalidGrantException)
        {
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "invalid_grant", deleteFutureFromUtc: clock.GetUtcNow(), ct: ct);
        }
        catch (GoogleTransientException ex)
        {
            logger.LogWarning(ex, "Transient failure refreshing Google token for source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.Error, "transient_token", deleteFutureFromUtc: null, ct: ct);
        }

        var opts = options.Value;
        var syncStart = clock.GetUtcNow();
        var syncEnd = syncStart.Add(opts.SyncWindow);

        IReadOnlyList<GoogleBusyWindow> busy;
        try
        {
            busy = await google.QueryFreeBusyAsync(token.AccessToken, syncStart, syncEnd, ct);
        }
        catch (GoogleInvalidGrantException)
        {
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.NeedsReconnect, "invalid_grant", deleteFutureFromUtc: syncStart, ct: ct);
        }
        catch (GoogleTransientException ex)
        {
            logger.LogWarning(ex, "Transient failure querying Google freeBusy for source {SourceId}.", sourceId);
            return await PersistTerminalAsync(sourceId, userId, ScheduleSourceConnectionStatus.Error, "transient_freebusy", deleteFutureFromUtc: null, ct: ct);
        }

        // Step 4: persist everything inside an execution strategy + transaction so
        // Aspire's NpgsqlRetryingExecutionStrategy can retry on transient DB faults
        // without re-issuing Google calls.
        var rotatedRefreshToken = !string.IsNullOrEmpty(token.RefreshToken) &&
            !string.Equals(token.RefreshToken, plaintextRefreshToken, StringComparison.Ordinal)
            ? token.RefreshToken
            : null;

        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync<(Guid sourceId, Guid userId, GoogleTokenResult token, IReadOnlyList<GoogleBusyWindow> busy, string? rotated, DateTimeOffset syncStart, DateTimeOffset syncEnd),
            ScheduleSyncResult>(
            (sourceId, userId, token, busy, rotatedRefreshToken, syncStart, syncEnd),
            PersistSyncAsync,
            verifySucceeded: null,
            cancellationToken: ct);
    }

    private async Task<ScheduleSyncResult> PersistSyncAsync(
        DbContext _,
        (Guid sourceId, Guid userId, GoogleTokenResult token, IReadOnlyList<GoogleBusyWindow> busy, string? rotated, DateTimeOffset syncStart, DateTimeOffset syncEnd) ctx,
        CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // PG advisory locks are session-level; scoping with _xact_lock auto-releases at
        // commit/rollback so we don't have to babysit cleanup on a process crash.
        var advisoryKey = ToAdvisoryKey(ctx.sourceId);
        if (!await TryAcquireAdvisoryLockAsync(advisoryKey, ct))
        {
            await tx.RollbackAsync(ct);
            return new ScheduleSyncResult(ScheduleSyncOutcome.LockHeld, 0, "sync_in_progress");
        }

        // Reload the source with tracking inside the same transaction so state read +
        // state write are consistent under the advisory lock.
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

        // Window-replace: nuke this source's events in the sync window, then insert
        // fresh ones. Free/busy windows from Google have no stable IDs, so this is the
        // only correct merge strategy.
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

    /// <summary>
    /// Persists a terminal-error state on the source: status flip, error code, optional
    /// deletion of future events (for invalid_grant). Wrapped in an execution strategy
    /// so it composes safely with Aspire's NpgsqlRetryingExecutionStrategy.
    /// </summary>
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
        // pg_try_advisory_xact_lock returns boolean. EF Core's SqlQueryRaw<T> for a
        // scalar primitive requires the projected column be named "Value".
        var result = await db.Database
            .SqlQueryRaw<bool>("SELECT pg_try_advisory_xact_lock({0}) AS \"Value\"", key)
            .ToListAsync(ct);
        return result.Count == 1 && result[0];
    }

    /// <summary>
    /// Derives a 64-bit lock key from a Guid by XOR-folding its 16 bytes. Smaller hashes
    /// (e.g. <c>hashtext()</c>) can collide and would serialize unrelated sources.
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
