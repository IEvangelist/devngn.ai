// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Schedule.Google;

/// <summary>Token-exchange result from Google's OAuth2 token endpoint.</summary>
/// <param name="AccessToken">Short-lived bearer for the free/busy API.</param>
/// <param name="RefreshToken">
/// May be <c>null</c> on refresh-token responses — Google only rotates occasionally.
/// On the initial authorization-code exchange, a null here means the user did not
/// grant offline access and we cannot persist the source.
/// </param>
/// <param name="GrantedScope">Space-delimited scope string Google actually issued.</param>
/// <param name="ExpiresAt">Absolute UTC time when <paramref name="AccessToken"/> stops working.</param>
public sealed record GoogleTokenResult(
    string AccessToken,
    string? RefreshToken,
    string? GrantedScope,
    DateTimeOffset ExpiresAt);

/// <summary>One busy window returned by Google's <c>freebusy.query</c>.</summary>
public sealed record GoogleBusyWindow(DateTimeOffset StartUtc, DateTimeOffset EndUtc);

/// <summary>Strongly-typed surface for the small slice of Google we use. Lets tests substitute a fake.</summary>
public interface IGoogleCalendarClient
{
    /// <summary>Exchanges a one-time authorization code for an access + refresh token pair. NEVER retried.</summary>
    Task<GoogleTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct);

    /// <summary>Refreshes an access token. Not retried — see rubber-duck finding on rotation race.</summary>
    Task<GoogleTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct);

    /// <summary>Returns busy windows in <c>[from, to)</c> for the user's primary calendar.</summary>
    Task<IReadOnlyList<GoogleBusyWindow>> QueryFreeBusyAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
}

/// <summary>
/// Thrown when Google returns <c>invalid_grant</c> for a refresh-token exchange. The
/// caller pivots the source to <see cref="Devngn.Wellness.Api.Data.Entities.ScheduleSourceConnectionStatus.NeedsReconnect"/>
/// instead of marking it as a transient error.
/// </summary>
public sealed class GoogleInvalidGrantException(string message) : Exception(message);

/// <summary>
/// Thrown for transient Google failures (5xx, timeout, transport). Caller flips the
/// source to <see cref="Devngn.Wellness.Api.Data.Entities.ScheduleSourceConnectionStatus.Error"/>
/// but does not require the user to reconnect.
/// </summary>
public sealed class GoogleTransientException(string message, Exception? inner = null) : Exception(message, inner);
