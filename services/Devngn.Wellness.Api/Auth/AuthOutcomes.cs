// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Result of a device-flow poll. The endpoint shape is driven entirely by this discriminated
/// state: success carries the GitHub access token, in-progress states carry the next
/// interval to honor, and failures carry the GitHub error code verbatim.
/// </summary>
internal abstract record DevicePollOutcome
{
    public sealed record Pending(int IntervalSeconds) : DevicePollOutcome;

    public sealed record SlowDown(int IntervalSeconds) : DevicePollOutcome;

    public sealed record Failed(string Error, string? Description) : DevicePollOutcome;

    public sealed record Succeeded(string AccessToken, string? Scope) : DevicePollOutcome;
}

/// <summary>Web-flow callback exchange outcome.</summary>
internal abstract record WebCallbackOutcome
{
    public sealed record Succeeded(string AccessToken, string? Scope) : WebCallbackOutcome;

    public sealed record Failed(string Error, string? Description) : WebCallbackOutcome;
}
