// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Orchestrates a single "deliver a prompt now if one is due" pass: detect the active
/// gap (cooldown-aware), match an activity to it, and persist the resulting
/// <see cref="Prompt"/>. Used by the REST <c>POST /v1/prompts/next</c> fallback and by
/// the SSE / WebSocket streaming loops (each loop iteration runs in its own DI scope).
/// </summary>
internal interface IPromptService
{
    /// <summary>
    /// If a gap is currently open for the user and they aren't within the prompt
    /// cooldown, selects an activity, persists a delivered <see cref="Prompt"/>, and
    /// returns it. Returns <c>null</c> when there's no active gap or no activity fits.
    /// </summary>
    Task<PromptResponse?> GenerateNextPromptAsync(
        Guid userId,
        DeliveryChannel channel,
        TimeZoneInfo timeZone,
        CancellationToken cancellationToken);
}
