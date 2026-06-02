// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Schedule.Google;
using Devngn.Wellness.Api.Schedule.OAuth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule;

internal static class ScheduleConnectEndpoints
{
    public static IEndpointRouteBuilder MapScheduleConnectEndpoints(this IEndpointRouteBuilder app)
    {
        var connect = app.MapGroup("/v1/schedule/connect")
            .WithTags("ScheduleConnect");

        // /connect is authenticated + consent-gated — only signed-in users with valid
        // consent can initiate an OAuth handshake against their own account.
        connect.MapGet("google", BeginGoogleAsync)
            .RequireAuthorization()
            .RequireConsent()
            .WithName("BeginGoogleConnect");

        // /callback is anonymous because the OAuth redirect doesn't carry our JWT —
        // the user is identified by the persisted state row instead.
        var callback = app.MapGroup("/v1/schedule/callback").WithTags("ScheduleConnect");
        callback.MapGet("google", CompleteGoogleAsync).WithName("CompleteGoogleConnect");

        return app;
    }

    private static async Task<IResult> BeginGoogleAsync(
        [FromQuery(Name = "returnPath")] string? returnPath,
        ICurrentUserContext currentUser,
        IOptions<GoogleCalendarOptions> options,
        IScheduleOAuthStateStore stateStore,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (!AuthEndpoints.IsSafeRelativePath(returnPath))
        {
            return Results.BadRequest(new
            {
                error = "invalid_return_path",
                message = "returnPath must be a relative path beginning with '/' with no scheme or '//'.",
            });
        }

        var opts = options.Value;
        var state = PkcePair.NewState();
        var (verifier, challenge) = PkcePair.Generate();
        var expiresAt = clock.GetUtcNow().Add(opts.OAuthStateTtl);

        // Persist the state row before redirecting so the callback can't pretend a
        // state existed that we never minted.
        await stateStore.PersistAsync(
            ScheduleOAuthProvider.Google,
            state,
            currentUser.UserId!.Value,
            verifier,
            string.IsNullOrEmpty(returnPath) ? "/" : returnPath!,
            expiresAt,
            ct);

        // access_type=offline + prompt=consent forces Google to mint a refresh token
        // even on subsequent connects, which is exactly what we want when a user
        // reconnects after NeedsReconnect.
        var redirect = "https://accounts.google.com/o/oauth2/v2/auth"
            + "?response_type=code"
            + $"&client_id={Uri.EscapeDataString(opts.ClientId)}"
            + $"&redirect_uri={Uri.EscapeDataString(opts.RedirectUri)}"
            + $"&scope={Uri.EscapeDataString(opts.Scope)}"
            + $"&state={Uri.EscapeDataString(state)}"
            + $"&code_challenge={Uri.EscapeDataString(challenge)}"
            + "&code_challenge_method=S256"
            + "&access_type=offline"
            + "&include_granted_scopes=true"
            + "&prompt=consent";

        return Results.Redirect(redirect);
    }

    private static async Task<IResult> CompleteGoogleAsync(
        [FromQuery(Name = "code")] string? code,
        [FromQuery(Name = "state")] string? state,
        [FromQuery(Name = "error")] string? error,
        IScheduleOAuthStateStore stateStore,
        IGoogleCalendarClient google,
        IRefreshTokenProtector protector,
        WellnessDbContext db,
        IOptions<GoogleCalendarOptions> options,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (string.IsNullOrEmpty(state))
        {
            return Results.BadRequest(new { error = "missing_state" });
        }

        var snapshot = await stateStore.ConsumeAsync(ScheduleOAuthProvider.Google, state, ct);
        if (snapshot is null)
        {
            return Results.BadRequest(new { error = "invalid_state" });
        }

        var returnPath = snapshot.ReturnPath;

        if (!string.IsNullOrEmpty(error))
        {
            // Google bounced the user (denied consent, etc). Redirect back with the
            // error preserved so the caller's app can surface a friendly message.
            return Results.Redirect(AppendError(returnPath, error));
        }

        if (string.IsNullOrEmpty(code))
        {
            return Results.Redirect(AppendError(returnPath, "missing_code"));
        }

        // Re-validate the user and consent before we mutate anything: the consent FK
        // would block the SaveChanges otherwise, but throwing a controlled 4xx is much
        // friendlier than letting the request 500.
        var userExists = await db.Users.AnyAsync(u => u.Id == snapshot.UserId, ct);
        if (!userExists)
        {
            return Results.Redirect(AppendError(returnPath, "user_not_found"));
        }
        var hasConsent = await db.ConsentRecords.AnyAsync(c => c.UserId == snapshot.UserId, ct);
        if (!hasConsent)
        {
            return Results.Redirect(AppendError(returnPath, "consent_required"));
        }

        GoogleTokenResult token;
        try
        {
            token = await google.ExchangeAuthorizationCodeAsync(code, snapshot.CodeVerifier, ct);
        }
        catch (GoogleInvalidGrantException)
        {
            // Almost always means the user took too long to consent and the auth code
            // expired. They'll retry from /connect/google.
            return Results.Redirect(AppendError(returnPath, "invalid_grant"));
        }
        catch (GoogleTransientException)
        {
            return Results.Redirect(AppendError(returnPath, "google_unavailable"));
        }

        if (string.IsNullOrEmpty(token.RefreshToken))
        {
            // Without a refresh token we can never sync — refuse to create a half-broken source.
            return Results.Redirect(AppendError(returnPath, "missing_refresh_token"));
        }

        var requestedScopes = options.Value.Scope
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var grantedScopes = (token.GrantedScope ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        // Defense against scope downgrade: if Google issued a narrower scope than we
        // asked for, the source would silently fail at /freeBusy time. Catch it now.
        if (requestedScopes.Except(grantedScopes, StringComparer.Ordinal).Any())
        {
            return Results.Redirect(AppendError(returnPath, "insufficient_scope"));
        }

        // One Google source per user. Upsert rather than insert so reconnect after a
        // NeedsReconnect doesn't leave duplicate sources behind (cf. rubber-duck #5).
        var existing = await db.ScheduleSources
            .SingleOrDefaultAsync(s => s.UserId == snapshot.UserId && s.Type == ScheduleSourceType.Google, ct);

        var now = clock.GetUtcNow();
        var ciphertext = protector.Protect(token.RefreshToken);

        if (existing is null)
        {
            db.ScheduleSources.Add(new ScheduleSource
            {
                UserId = snapshot.UserId,
                Type = ScheduleSourceType.Google,
                DisplayName = "Google Calendar",
                ProtectedRefreshToken = ciphertext,
                Scope = token.GrantedScope,
                LastRefreshAt = now,
                ConnectionStatus = ScheduleSourceConnectionStatus.Connected,
                IsEnabled = true,
                CreatedAt = now,
            });
        }
        else
        {
            existing.ProtectedRefreshToken = ciphertext;
            existing.Scope = token.GrantedScope;
            existing.LastRefreshAt = now;
            existing.ConnectionStatus = ScheduleSourceConnectionStatus.Connected;
            existing.IsEnabled = true;
            existing.LastSyncErrorCode = null;
            existing.LastSyncErrorAt = null;
        }

        await db.SaveChangesAsync(ct);

        return Results.Redirect(AppendQuery(returnPath, "connected", "google"));
    }

    private static string AppendError(string returnPath, string error)
        => AppendQuery(returnPath, "error", error);

    private static string AppendQuery(string path, string key, string value)
    {
        var sep = path.Contains('?') ? '&' : '?';
        return $"{path}{sep}{Uri.EscapeDataString(key)}={Uri.EscapeDataString(value)}";
    }
}
