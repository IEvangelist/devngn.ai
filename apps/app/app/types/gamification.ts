// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Ergonomic aliases for the gamification and social API schemas that are NOT
 * individually exported by @devngn/wellness-types/index.ts but exist in the
 * generated `components["schemas"]` map. Accessing them via WellnessSchemas
 * is the correct pattern for types Wave 1 index.ts missed.
 *
 * UI-only view-model types (not in the API schema) are defined at the bottom.
 */

import type { WellnessSchemas } from "@devngn/wellness-types";

// ── Gamification ──────────────────────────────────────────────────────────────
export type BadgeResponse        = WellnessSchemas["BadgeResponse"];
export type MilestoneResponse    = WellnessSchemas["MilestoneResponse"];
export type LeaderboardEntry     = WellnessSchemas["LeaderboardEntry"];
export type PlayerStateResponse  = WellnessSchemas["PlayerStateResponse"];
export type RankTier             = WellnessSchemas["RankTier"];

// ── Social ────────────────────────────────────────────────────────────────────
export type SocialProfileResponse      = WellnessSchemas["SocialProfileResponse"];
export type UpsertSocialProfileRequest = WellnessSchemas["UpsertSocialProfileRequest"];
export type FollowerResponse           = WellnessSchemas["FollowerResponse"];
export type FollowResponse             = WellnessSchemas["FollowResponse"];
export type FeedItemResponse           = WellnessSchemas["FeedItemResponse"];
export type FeedItemType               = WellnessSchemas["FeedItemType"];

// ── UI-only view models (not in the API schema) ───────────────────────────────

/** LeaderboardEntry enriched with display-only rank (array index+1) and current-user flag. */
export interface LeaderboardEntryView extends LeaderboardEntry {
  rank: number;
  isCurrentUser: boolean;
}
