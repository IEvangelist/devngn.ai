// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>The authenticated user behind the current access token.</summary>
public sealed record AuthenticatedUserResponse(
    Guid Id,
    long GitHubId,
    string Login,
    string? DisplayName,
    string? AvatarUrl);
