// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// A schedule provider the user has connected. Holds the encrypted refresh-token blob
/// for OAuth-backed providers and the connection state machine that drives sync.
/// </summary>
public sealed class ScheduleSource
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public ScheduleSourceType Type { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Opaque key into the credential store. Null for <see cref="ScheduleSourceType.User"/>
    /// sources that are populated by direct API push.
    /// </summary>
    public string? CredentialRef { get; set; }

    /// <summary>
    /// Base64-encoded payload of <c>IDataProtector.Protect(refreshTokenBytes)</c>. Only
    /// set for OAuth providers; never logged and never returned to API responses.
    /// </summary>
    public string? ProtectedRefreshToken { get; set; }

    /// <summary>Comma-separated set of OAuth scopes granted at authorization time.</summary>
    public string? Scope { get; set; }

    /// <summary>UTC timestamp of the most recent successful refresh-token exchange.</summary>
    public DateTimeOffset? LastRefreshAt { get; set; }

    /// <summary>Stable short code identifying the most recent sync error class (e.g. "invalid_grant", "rate_limited").</summary>
    public string? LastSyncErrorCode { get; set; }

    public DateTimeOffset? LastSyncErrorAt { get; set; }

    public ScheduleSourceConnectionStatus ConnectionStatus { get; set; } = ScheduleSourceConnectionStatus.Connected;

    public bool IsEnabled { get; set; } = true;

    public DateTimeOffset? LastSyncAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? User { get; set; }

    public ICollection<ScheduleEvent> Events { get; set; } = [];
}
