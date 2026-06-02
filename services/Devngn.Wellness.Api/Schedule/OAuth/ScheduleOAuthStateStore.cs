// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Schedule.OAuth;

/// <summary>Snapshot of a consumed-on-read OAuth state record.</summary>
public sealed record ScheduleOAuthStateSnapshot(
    string State,
    ScheduleOAuthProvider Provider,
    Guid UserId,
    string CodeVerifier,
    string ReturnPath);

/// <summary>
/// Persists and atomically consumes one-shot OAuth state records. The atomic consume
/// is the security invariant: if two callbacks race for the same state nonce, only one
/// observes the row in its <i>unconsumed</i> form.
/// </summary>
public interface IScheduleOAuthStateStore
{
    /// <summary>Persists a fresh state record.</summary>
    Task PersistAsync(ScheduleOAuthProvider provider, string state, Guid userId, string codeVerifier, string returnPath, DateTimeOffset expiresAt, CancellationToken ct);

    /// <summary>
    /// Atomically marks the state record consumed and returns its payload. Returns null
    /// if the state is unknown, already consumed, expired, or belongs to a different
    /// provider — any of which the callback treats as <c>invalid_state</c>.
    /// </summary>
    Task<ScheduleOAuthStateSnapshot?> ConsumeAsync(ScheduleOAuthProvider provider, string state, CancellationToken ct);
}

internal sealed class ScheduleOAuthStateStore(WellnessDbContext db, TimeProvider clock) : IScheduleOAuthStateStore
{
    public async Task PersistAsync(
        ScheduleOAuthProvider provider,
        string state,
        Guid userId,
        string codeVerifier,
        string returnPath,
        DateTimeOffset expiresAt,
        CancellationToken ct)
    {
        db.ScheduleOAuthStates.Add(new ScheduleOAuthState
        {
            State = state,
            Provider = provider,
            UserId = userId,
            CodeVerifier = codeVerifier,
            ReturnPath = returnPath,
            ExpiresAt = expiresAt,
            CreatedAt = clock.GetUtcNow(),
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task<ScheduleOAuthStateSnapshot?> ConsumeAsync(ScheduleOAuthProvider provider, string state, CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        // Single-statement consume: ExecuteUpdateAsync runs as one atomic UPDATE so
        // concurrent callbacks for the same state see exactly one success and one
        // zero-affected-rows. The "won the race" check is the row count, not a
        // separate read.
        var affected = await db.ScheduleOAuthStates
            .Where(s => s.State == state &&
                        s.Provider == provider &&
                        s.ConsumedAt == null &&
                        s.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.ConsumedAt, now), ct);

        if (affected == 0)
        {
            return null;
        }

        var snapshot = await db.ScheduleOAuthStates
            .AsNoTracking()
            .Where(s => s.State == state && s.Provider == provider)
            .Select(s => new ScheduleOAuthStateSnapshot(s.State, s.Provider, s.UserId, s.CodeVerifier, s.ReturnPath))
            .SingleOrDefaultAsync(ct);
        return snapshot;
    }
}
