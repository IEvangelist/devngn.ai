// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Schedule;

/// <summary>
/// Provider-agnostic outcome enum for one sync pass against a <see cref="Data.Entities.ScheduleSource"/>.
/// </summary>
public enum ScheduleSyncOutcome
{
    Success,
    NotFound,
    LockHeld,
    NeedsReconnect,
    TransientFailure,
    Disabled,
}

/// <summary>
/// Provider-agnostic sync result. Lives in the shared <see cref="Schedule"/> namespace
/// so both Google and Microsoft sync services produce the same shape without one
/// depending on the other's namespace.
/// </summary>
public sealed record ScheduleSyncResult(
    ScheduleSyncOutcome Outcome,
    int EventCount,
    string? ErrorCode = null);
