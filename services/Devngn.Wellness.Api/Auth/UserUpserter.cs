// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Idempotent upsert of a <see cref="User"/> by GitHub numeric id. The unique index on
/// <c>(GitHubId)</c> guarantees correctness; we layer a catch-and-retry on
/// <see cref="DbUpdateException"/> on top so two simultaneous first-time logins race
/// cleanly: the loser sees the winner's row on retry and updates mutable fields.
/// </summary>
internal interface IUserUpserter
{
    Task<User> UpsertAsync(GitHubUser githubUser, CancellationToken ct);
}

internal sealed class UserUpserter(WellnessDbContext db, TimeProvider timeProvider, ILogger<UserUpserter> logger) : IUserUpserter
{
    public async Task<User> UpsertAsync(GitHubUser githubUser, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(githubUser);

        var now = timeProvider.GetUtcNow();
        var existing = await db.Users.FirstOrDefaultAsync(u => u.GitHubId == githubUser.Id, ct);
        if (existing is not null)
        {
            ApplyMutableFields(existing, githubUser, now);
            await db.SaveChangesAsync(ct);
            return existing;
        }

        var fresh = new User
        {
            GitHubId = githubUser.Id,
            Login = githubUser.Login,
            DisplayName = githubUser.Name,
            AvatarUrl = githubUser.AvatarUrl,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Users.Add(fresh);

        try
        {
            await db.SaveChangesAsync(ct);
            return fresh;
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // Lost the race against a concurrent first-time login for the same GitHub id.
            // Detach the unsaved insert, reload the winner's row, and apply our mutable
            // field updates idempotently. Unique-index guarantee makes this safe.
            logger.LogInformation(
                "Concurrent first-time login for GitHub id {GitHubId}; reloading winner.",
                githubUser.Id);

            db.Entry(fresh).State = EntityState.Detached;
            var winner = await db.Users.SingleAsync(u => u.GitHubId == githubUser.Id, ct);
            ApplyMutableFields(winner, githubUser, now);
            await db.SaveChangesAsync(ct);
            return winner;
        }
    }

    private static void ApplyMutableFields(User user, GitHubUser github, DateTimeOffset now)
    {
        user.Login = github.Login;
        user.DisplayName = github.Name;
        user.AvatarUrl = github.AvatarUrl;
        user.UpdatedAt = now;
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        // Npgsql surfaces unique constraint violations with SqlState "23505".
        // EF Core wraps the provider exception so we walk the chain.
        for (Exception? cur = ex; cur is not null; cur = cur.InnerException)
        {
            var sqlStateProp = cur.GetType().GetProperty("SqlState");
            if (sqlStateProp?.GetValue(cur) is string sqlState && sqlState == "23505")
            {
                return true;
            }
        }
        return false;
    }
}
