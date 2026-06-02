// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Consent;

internal sealed record AcceptConsentRequest
{
    [Required]
    [StringLength(40, MinimumLength = 1)]
    public string Version { get; init; } = string.Empty;
}

internal sealed record ConsentSnapshot(string Version, string Text, DateTimeOffset AcceptedAt);

internal sealed record CurrentConsentText(string Version, string Text);

internal sealed record ConsentStateResponse(ConsentSnapshot? Accepted, CurrentConsentText Current);
