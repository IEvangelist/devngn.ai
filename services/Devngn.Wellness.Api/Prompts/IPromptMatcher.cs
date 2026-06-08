// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Everything the <see cref="IPromptMatcher"/> needs to pick a single activity for a
/// gap. Deliberately decoupled from EF and the gap engine: the caller projects the
/// gap length to seconds and materialises the user's catalog / profile / goals /
/// equipment so the matcher stays a pure, deterministic, unit-testable function.
/// </summary>
/// <param name="GapDurationSeconds">
/// Actual length of the active gap, in whole seconds (not floored minutes), so a
/// 90-second activity isn't rejected from a 119-second gap.
/// </param>
/// <param name="Profile">The user's wellness profile, or <c>null</c> if they haven't set one.</param>
/// <param name="Goals">The user's goal categories (may be empty); used to bias selection.</param>
/// <param name="EquipmentTags">
/// The lower-kebab equipment tags the user has registered. An activity matches only
/// when every one of its required tags is present here (subset semantics).
/// </param>
/// <param name="Catalog">The candidate activities to choose from.</param>
/// <param name="RecentActivityIds">
/// Activities delivered to this user recently; de-prioritised for variety.
/// </param>
internal sealed record PromptMatchContext(
    int GapDurationSeconds,
    Profile? Profile,
    IReadOnlyCollection<GoalCategory> Goals,
    IReadOnlySet<string> EquipmentTags,
    IReadOnlyList<Activity> Catalog,
    IReadOnlySet<Guid> RecentActivityIds);

/// <summary>
/// Picks the best-fit <see cref="Activity"/> for a gap given the user's context.
/// Pure and dependency-free so it can be exhaustively unit-tested without a DB.
/// </summary>
internal interface IPromptMatcher
{
    /// <summary>
    /// Returns the highest-scoring activity that fits the gap, or <c>null</c> when no
    /// activity passes the hard filters (equipment subset + duration fit).
    /// </summary>
    Activity? Match(PromptMatchContext context);
}
