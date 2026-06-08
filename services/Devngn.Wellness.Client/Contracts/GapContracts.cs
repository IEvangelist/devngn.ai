// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>A free interval detected in the caller's schedule.</summary>
public sealed record GapResponse(DateTimeOffset StartUtc, DateTimeOffset EndUtc, int DurationMinutes);
