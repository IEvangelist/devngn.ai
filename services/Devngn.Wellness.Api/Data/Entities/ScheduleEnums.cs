// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// Lifecycle status of a <see cref="ScheduleSource"/>'s connection to its upstream
/// provider. Separating "the user paused this" (<see cref="Disabled"/>) from
/// "the upstream refresh token is invalid" (<see cref="NeedsReconnect"/>) lets the
/// UI surface a reconnect prompt without surprising the user.
/// </summary>
public enum ScheduleSourceConnectionStatus
{
    /// <summary>User-pushed source or freshly-authorized OAuth source. No sync errors recorded.</summary>
    Connected,

    /// <summary>OAuth refresh-token exchange has been rejected; user must re-run the connect flow.</summary>
    NeedsReconnect,

    /// <summary>User has explicitly paused sync from this source.</summary>
    Disabled,

    /// <summary>Last sync failed with a transient (non-auth) upstream error. Will be retried.</summary>
    Error,

    /// <summary>Provider record exists but the OAuth callback has not yet completed (placeholder; not used in v1).</summary>
    PendingConnection,
}

/// <summary>
/// Identifies which OAuth provider an <see cref="ScheduleOAuthState"/> belongs to.
/// </summary>
public enum ScheduleOAuthProvider
{
    Google,
    Microsoft,
}
