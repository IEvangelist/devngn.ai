// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.Google;

namespace Devngn.Wellness.Api.Tests.Schedule;

/// <summary>
/// Programmable stub for <see cref="IGoogleCalendarClient"/>. Tests configure callbacks
/// to return canned token + free/busy responses (or throw) without going over the wire.
/// </summary>
internal sealed class FakeGoogleCalendarClient : IGoogleCalendarClient
{
    public Func<string, string, CancellationToken, Task<GoogleTokenResult>> OnExchange { get; set; } =
        (_, _, _) => Task.FromResult(new GoogleTokenResult(
            "access-default",
            "refresh-default",
            "https://www.googleapis.com/auth/calendar.freebusy",
            DateTimeOffset.UtcNow.AddHours(1)));

    public Func<string, CancellationToken, Task<GoogleTokenResult>> OnRefresh { get; set; } =
        (_, _) => Task.FromResult(new GoogleTokenResult(
            "access-default",
            null,
            "https://www.googleapis.com/auth/calendar.freebusy",
            DateTimeOffset.UtcNow.AddHours(1)));

    public Func<string, DateTimeOffset, DateTimeOffset, CancellationToken, Task<IReadOnlyList<GoogleBusyWindow>>> OnFreeBusy { get; set; } =
        (_, _, _, _) => Task.FromResult<IReadOnlyList<GoogleBusyWindow>>([]);

    public int ExchangeCount;
    public int RefreshCount;
    public int FreeBusyCount;

    public Task<GoogleTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct)
    {
        Interlocked.Increment(ref ExchangeCount);
        return OnExchange(code, codeVerifier, ct);
    }

    public Task<GoogleTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct)
    {
        Interlocked.Increment(ref RefreshCount);
        return OnRefresh(refreshToken, ct);
    }

    public Task<IReadOnlyList<GoogleBusyWindow>> QueryFreeBusyAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        Interlocked.Increment(ref FreeBusyCount);
        return OnFreeBusy(accessToken, from, to, ct);
    }
}
