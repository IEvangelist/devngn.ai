// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Schedule.Microsoft;

/// <summary>Token-exchange result from Microsoft's identity platform v2.0 token endpoint.</summary>
/// <param name="AccessToken">Short-lived bearer for Microsoft Graph.</param>
/// <param name="RefreshToken">
/// May be <c>null</c> on refresh responses — Microsoft only rotates occasionally.
/// On the initial authorization-code exchange, a null here means we did not get
/// <c>offline_access</c> granted and cannot persist the source.
/// </param>
/// <param name="GrantedScope">
/// Space-delimited scope string Microsoft actually issued. <c>offline_access</c> is NOT
/// reliably echoed back on the access token response (it's a flag, not a resource scope),
/// so the scope-downgrade check only looks for resource permissions.
/// </param>
/// <param name="ExpiresAt">Absolute UTC time when <paramref name="AccessToken"/> stops working.</param>
public sealed record MicrosoftTokenResult(
    string AccessToken,
    string? RefreshToken,
    string? GrantedScope,
    DateTimeOffset ExpiresAt);

/// <summary>One busy window distilled from a Graph calendarView entry.</summary>
public sealed record MicrosoftBusyWindow(DateTimeOffset StartUtc, DateTimeOffset EndUtc);

/// <summary>Strongly-typed surface for the small slice of Microsoft Graph we use.</summary>
public interface IMicrosoftCalendarClient
{
    /// <summary>Exchanges a one-time authorization code for an access + refresh token pair. NEVER retried.</summary>
    Task<MicrosoftTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct);

    /// <summary>Refreshes an access token. Not retried — Microsoft rotates refresh tokens.</summary>
    Task<MicrosoftTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct);

    /// <summary>Returns busy windows in <c>[from, to)</c> from the user's primary calendar.</summary>
    Task<IReadOnlyList<MicrosoftBusyWindow>> QueryBusyWindowsAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
}

/// <summary>
/// Thrown when Microsoft rejects a refresh-token exchange (<c>invalid_grant</c> or
/// AADSTS code indicating the refresh token is unusable). The caller flips the source
/// to <see cref="Devngn.Wellness.Api.Data.Entities.ScheduleSourceConnectionStatus.NeedsReconnect"/>.
/// </summary>
public sealed class MicrosoftInvalidGrantException(string message) : Exception(message);

/// <summary>
/// Thrown for transient Microsoft failures (5xx, 429, timeout, transport). Caller flips
/// the source to <see cref="Devngn.Wellness.Api.Data.Entities.ScheduleSourceConnectionStatus.Error"/>
/// but does not require the user to reconnect.
/// </summary>
public sealed class MicrosoftTransientException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Thrown when Microsoft Graph returns <c>403 Forbidden</c> for the calendarView call.
/// Deliberately NOT folded into <see cref="MicrosoftInvalidGrantException"/>: a 403 here
/// typically means a tenant policy / conditional access / insufficient delegated
/// privilege blocked the call — not that the refresh token is bad. The caller records
/// a non-destructive error rather than deleting events and demanding reconnect.
/// </summary>
public sealed class MicrosoftForbiddenException(string message) : Exception(message);
