// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Tests;

/// <summary>
/// Minimal <see cref="TimeProvider"/> that always returns a fixed UTC instant.
/// Use for test scenarios that need a deterministic clock without taking a dependency
/// on <c>Microsoft.Extensions.TimeProvider.Testing</c>.
/// </summary>
internal sealed class FixedTimeProvider(DateTimeOffset fixedUtc) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => fixedUtc;
}
