// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Consent;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Development-only sign-in shortcut. Mints a first-party JWT for a synthetic local
/// user WITHOUT contacting GitHub, so the desktop app and PWA can be exercised end to
/// end when no real GitHub OAuth app (with device flow enabled) is configured — the
/// local <c>aspire start</c> environment injects only a placeholder GitHub client id,
/// so the real device flow legitimately 404s.
/// <para>
/// This is mapped ONLY when <c>IHostEnvironment.IsDevelopment()</c> is true (see
/// <c>Program.cs</c>), so it can never be reached in a deployed environment.
/// </para>
/// </summary>
internal static class DevAuthEndpoints
{
    // Synthetic GitHub id for the local dev user. Negative so it can never collide with
    // a real GitHub numeric id (those are positive), keeping the unique (GitHubId) index
    // safe and letting repeated dev logins resolve to the same row.
    private const long DevGitHubId = -1;

    public static IEndpointRouteBuilder MapDevAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/v1/auth/dev/login", DevLoginAsync)
            .Produces<AuthEndpoints.AccessTokenResponse>()
            .WithName("DevLogin")
            .WithTags("Auth")
            .WithSummary("Development-only sign-in that bypasses GitHub and mints a local JWT.")
            .AllowAnonymous();

        return endpoints;
    }

    /// <summary>Optional overrides so testers can shape the synthetic local identity.</summary>
    public sealed record DevLoginRequest(string? Login, string? DisplayName);

    private static async Task<IResult> DevLoginAsync(
        DevLoginRequest? body,
        IUserUpserter upserter,
        IJwtTokenService jwt,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        var login = string.IsNullOrWhiteSpace(body?.Login) ? "devngn-local" : body!.Login!.Trim();
        var displayName = string.IsNullOrWhiteSpace(body?.DisplayName)
            ? "Local Dev User"
            : body!.DisplayName!.Trim();

        // Reuse the exact same completion path as the real OAuth flows: upsert the user
        // then mint a JWT, so the issued token is indistinguishable from a GitHub sign-in.
        var synthetic = new GitHubUser(DevGitHubId, login, displayName, AvatarUrl: null);
        var user = await upserter.UpsertAsync(synthetic, ct);

        // Dev convenience: idempotently grant current-version consent for the synthetic
        // user. The app has no consent UI yet, so without this every consent-gated feature
        // (gamification, prompts, goals, ...) would 403 and the app couldn't be evaluated.
        await EnsureConsentAsync(db, user.Id, clock, ct);

        var token = jwt.Issue(user);

        return Results.Ok(new AuthEndpoints.AccessTokenResponse(
            token.AccessToken,
            token.TokenType,
            token.ExpiresAt,
            new AuthEndpoints.AuthenticatedUserResponse(
                user.Id, user.GitHubId, user.Login, user.DisplayName, user.AvatarUrl)));
    }

    private static async Task EnsureConsentAsync(
        WellnessDbContext db,
        Guid userId,
        TimeProvider clock,
        CancellationToken ct)
    {
        var version = ConsentRegistry.CurrentVersion;
        var text = ConsentRegistry.KnownVersions[version];

        var existing = await db.ConsentRecords
            .Where(c => c.UserId == userId)
            .SingleOrDefaultAsync(ct);

        if (existing is null)
        {
            db.ConsentRecords.Add(new ConsentRecord
            {
                UserId = userId,
                Version = version,
                Text = text,
                AcceptedAt = clock.GetUtcNow(),
            });
        }
        else if (!string.Equals(existing.Version, version, StringComparison.Ordinal))
        {
            existing.Version = version;
            existing.Text = text;
            existing.AcceptedAt = clock.GetUtcNow();
        }
        else
        {
            return;
        }

        await db.SaveChangesAsync(ct);
    }
}
