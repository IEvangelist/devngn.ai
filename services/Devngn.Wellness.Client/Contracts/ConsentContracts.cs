// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>Request body for accepting the current consent version.</summary>
public sealed record AcceptConsentRequest
{
    /// <summary>The consent text version the user is accepting.</summary>
    public string Version { get; init; } = string.Empty;
}

/// <summary>A snapshot of the consent the user accepted.</summary>
public sealed record ConsentSnapshot(string Version, string Text, DateTimeOffset AcceptedAt);

/// <summary>The consent text currently in force on the server.</summary>
public sealed record CurrentConsentText(string Version, string Text);

/// <summary>The user's consent state: what they accepted (if anything) and what is current.</summary>
public sealed record ConsentStateResponse(ConsentSnapshot? Accepted, CurrentConsentText Current);
