// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.Microsoft;

namespace Devngn.Wellness.Api.Tests.Schedule;

/// <summary>
/// Programmable stub for <see cref="IMicrosoftCalendarClient"/>. Tests configure
/// callbacks to return canned token + calendarView responses (or throw) without going
/// over the wire to login.microsoftonline.com / graph.microsoft.com.
/// </summary>
internal sealed class FakeMicrosoftCalendarClient : IMicrosoftCalendarClient
{
    public Func<string, string, CancellationToken, Task<MicrosoftTokenResult>> OnExchange { get; set; } =
        (_, _, _) => Task.FromResult(new MicrosoftTokenResult(
            "access-default",
            "refresh-default",
            "https://graph.microsoft.com/Calendars.Read",
            DateTimeOffset.UtcNow.AddHours(1)));

    public Func<string, CancellationToken, Task<MicrosoftTokenResult>> OnRefresh { get; set; } =
        (_, _) => Task.FromResult(new MicrosoftTokenResult(
            "access-default",
            null,
            "https://graph.microsoft.com/Calendars.Read",
            DateTimeOffset.UtcNow.AddHours(1)));

    public Func<string, DateTimeOffset, DateTimeOffset, CancellationToken, Task<IReadOnlyList<MicrosoftBusyWindow>>> OnBusy { get; set; } =
        (_, _, _, _) => Task.FromResult<IReadOnlyList<MicrosoftBusyWindow>>([]);

    public int ExchangeCount;
    public int RefreshCount;
    public int BusyCount;

    public Task<MicrosoftTokenResult> ExchangeAuthorizationCodeAsync(string code, string codeVerifier, CancellationToken ct)
    {
        Interlocked.Increment(ref ExchangeCount);
        return OnExchange(code, codeVerifier, ct);
    }

    public Task<MicrosoftTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct)
    {
        Interlocked.Increment(ref RefreshCount);
        return OnRefresh(refreshToken, ct);
    }

    public Task<IReadOnlyList<MicrosoftBusyWindow>> QueryBusyWindowsAsync(string accessToken, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        Interlocked.Increment(ref BusyCount);
        return OnBusy(accessToken, from, to, ct);
    }
}
