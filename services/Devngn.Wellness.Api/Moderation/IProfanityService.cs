// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Moderation;

/// <summary>
/// Abstracts profanity filtering so endpoints can sanitize user-supplied text
/// and the service can be mocked in tests without a live container.
/// </summary>
internal interface IProfanityService
{
    /// <summary>
    /// Returns the sanitized form of <paramref name="text"/> (profanities replaced
    /// with asterisks). Returns the original text unchanged if the filter service
    /// is unreachable.
    /// </summary>
    Task<string> SanitizeAsync(string text, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns <see langword="true"/> if <paramref name="text"/> contains no profanity.
    /// </summary>
    Task<bool> IsCleanAsync(string text, CancellationToken cancellationToken = default);
}
