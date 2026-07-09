// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// One instruction in an activity's guided sequence. Simple activities have no steps and
/// rely on <see cref="Activity.Description"/>; more involved ones carry an ordered list so
/// the client can render holds, reps, and sets instead of a single sentence.
/// </summary>
/// <param name="Text">The instruction line (e.g. "Hinge forward from the hips").</param>
/// <param name="HoldSeconds">Optional isometric hold, in seconds, for this step.</param>
/// <param name="Reps">Optional repetition count for this step.</param>
/// <param name="Sets">Optional number of sets for this step.</param>
public sealed record ActivityStep(
    string Text,
    int? HoldSeconds = null,
    int? Reps = null,
    int? Sets = null);
