// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// One-shot OAuth state entry for the schedule-source connect flow. The connect endpoint
/// stores (UserId, Provider, CodeVerifier, ReturnPath) keyed by a freshly-generated state
/// nonce; the callback endpoint reads and atomically consumes it. Persisting in Postgres
/// (rather than the singleton in-memory <c>OAuthStateStore</c> the GitHub sign-in flow
/// uses) keeps the flow correct under rolling deploys and multi-instance hosting where
/// the callback may land on a different process than the initial redirect.
/// </summary>
public sealed class ScheduleOAuthState
{
    /// <summary>The CSRF-resistant nonce the provider echoes back as the <c>state</c> parameter.</summary>
    public string State { get; set; } = string.Empty;

    public ScheduleOAuthProvider Provider { get; set; }

    /// <summary>User initiating the connect flow. Resolved from the bearer token at /connect time.</summary>
    public Guid UserId { get; set; }

    /// <summary>PKCE verifier (43-128 chars).</summary>
    public string CodeVerifier { get; set; } = string.Empty;

    /// <summary>Safe-relative path within the calling app to redirect back to after the callback.</summary>
    public string ReturnPath { get; set; } = "/";

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Non-null once the callback has consumed this state; subsequent reads must reject it.</summary>
    public DateTimeOffset? ConsumedAt { get; set; }
}
