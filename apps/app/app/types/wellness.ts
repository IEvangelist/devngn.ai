// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Ergonomic aliases for the profile, equipment, catalog, and schedule/gap API
 * schemas. These back the personal-setup, equipment, and interruption-forecast
 * features. Shapes come straight from the generated OpenAPI types so the UI
 * never drifts from the contract.
 *
 * UI-only view-model types (the forecast is composed client-side from gaps +
 * catalog) are defined at the bottom.
 */

import type { WellnessSchemas } from "@devngn/wellness-types";

// ── Profile ───────────────────────────────────────────────────────────────
export type ProfileResponse = WellnessSchemas["ProfileResponse"];
export type UpsertProfileRequest = WellnessSchemas["UpsertProfileRequest"];
export type FitnessBaseline = WellnessSchemas["FitnessBaseline"];
export type IntensityLevel = WellnessSchemas["IntensityLevel"];

// ── Equipment ─────────────────────────────────────────────────────────────
export type EquipmentResponse = WellnessSchemas["EquipmentResponse"];
export type CreateEquipmentRequest = WellnessSchemas["CreateEquipmentRequest"];
export type UpdateEquipmentRequest = WellnessSchemas["UpdateEquipmentRequest"];

// ── Catalog / schedule ────────────────────────────────────────────────────
export type ActivityResponse = WellnessSchemas["ActivityResponse"];
export type BodyArea = WellnessSchemas["BodyArea"];
export type GapResponse = WellnessSchemas["GapResponse"];

// ── Goals (needed to mirror the server matcher's goal-alignment scoring) ────
export type GoalResponse = WellnessSchemas["GoalResponse"];
export type GoalCategory = WellnessSchemas["GoalCategory"];

// ── UI-only view models (not in the API schema) ────────────────────────────

/**
 * One entry in the interruption forecast: an upcoming free-time gap paired with
 * the activity the engine is most likely to deliver into it. When `isSurprise`
 * is true the pick is intentionally withheld so the nudge stays a delight.
 */
export interface ForecastItem {
  gap: GapResponse;
  /** The predicted activity, or null when nothing in the catalog fits. */
  activity: ActivityResponse | null;
  /** True when this slot is intentionally kept a surprise (activity hidden). */
  isSurprise: boolean;
}
