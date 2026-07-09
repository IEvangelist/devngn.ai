// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

/**
 * Types-only surface for the devngn.ai Wellness API.
 *
 * `schema.ts` is generated from the API's committed OpenAPI document
 * (`services/Devngn.Wellness.Api/openapi/v1.json`) via `openapi-typescript`.
 * Do not edit it by hand — run `pnpm --filter @devngn/wellness-types generate`.
 *
 * This module re-exports the raw generated surface (`paths`, `components`,
 * `operations`) and adds ergonomic aliases for the request/response DTOs and
 * enums so consumers (the VS Code extension and CLI daemon) can `fetch` the
 * API with full typing without reaching into `components["schemas"][...]`.
 *
 * It also bundles the raw OpenAPI document itself (`wellnessOpenApiDocument`,
 * a generated copy of the API's committed `openapi/v1.json`) so the hosted site
 * can serve it to an OpenAPI viewer without reaching across package boundaries.
 */

export type * from "./schema.js";

import type { components, operations, paths } from "./schema.js";
import openApiDocument from "./openapi.json" with { type: "json" };

/** The full generated OpenAPI path map (route -> verb -> operation). */
export type WellnessPaths = paths;
/** The full generated operation map (operationId -> request/response shapes). */
export type WellnessOperations = operations;
/** The full generated component map (schemas, responses, parameters, ...). */
export type WellnessComponents = components;
/** Shorthand for every named schema in the OpenAPI document. */
export type WellnessSchemas = components["schemas"];

// --- Enums (string-literal unions) ------------------------------------------
export type BodyArea = WellnessSchemas["BodyArea"];
export type IntensityLevel = WellnessSchemas["IntensityLevel"];
export type FitnessBaseline = WellnessSchemas["FitnessBaseline"];
export type GoalCategory = WellnessSchemas["GoalCategory"];
export type ScheduleSourceType = WellnessSchemas["ScheduleSourceType"];
export type ScheduleSourceConnectionStatus =
  WellnessSchemas["ScheduleSourceConnectionStatus"];
export type DeliveryChannel = WellnessSchemas["DeliveryChannel"];

// --- Auth -------------------------------------------------------------------
export type AccessTokenResponse = WellnessSchemas["AccessTokenResponse"];
export type AuthenticatedUserResponse =
  WellnessSchemas["AuthenticatedUserResponse"];
export type AuthErrorResponse = WellnessSchemas["AuthErrorResponse"];
export type DeviceFlowStartResponse =
  WellnessSchemas["DeviceFlowStartResponse"];
export type DeviceFlowPollRequest = WellnessSchemas["DeviceFlowPollRequest"];

// --- Consent ----------------------------------------------------------------
export type AcceptConsentRequest = WellnessSchemas["AcceptConsentRequest"];
export type ConsentSnapshot = WellnessSchemas["ConsentSnapshot"];
export type CurrentConsentText = WellnessSchemas["CurrentConsentText"];
export type ConsentStateResponse = WellnessSchemas["ConsentStateResponse"];

// --- Profile ----------------------------------------------------------------
export type UpsertProfileRequest = WellnessSchemas["UpsertProfileRequest"];
export type ProfileResponse = WellnessSchemas["ProfileResponse"];

// --- Goals ------------------------------------------------------------------
export type CreateGoalRequest = WellnessSchemas["CreateGoalRequest"];
export type UpdateGoalRequest = WellnessSchemas["UpdateGoalRequest"];
export type GoalResponse = WellnessSchemas["GoalResponse"];

// --- Equipment --------------------------------------------------------------
export type CreateEquipmentRequest = WellnessSchemas["CreateEquipmentRequest"];
export type UpdateEquipmentRequest = WellnessSchemas["UpdateEquipmentRequest"];
export type EquipmentResponse = WellnessSchemas["EquipmentResponse"];

// --- Schedule ---------------------------------------------------------------
export type CreateScheduleSourceRequest =
  WellnessSchemas["CreateScheduleSourceRequest"];
export type UpdateScheduleSourceRequest =
  WellnessSchemas["UpdateScheduleSourceRequest"];
export type ScheduleSourceResponse = WellnessSchemas["ScheduleSourceResponse"];
export type PushScheduleEventItem = WellnessSchemas["PushScheduleEventItem"];
export type PushScheduleEventsRequest =
  WellnessSchemas["PushScheduleEventsRequest"];
export type ScheduleEventResponse = WellnessSchemas["ScheduleEventResponse"];
export type ScheduleSyncResponse = WellnessSchemas["ScheduleSyncResponse"];

// --- Gaps -------------------------------------------------------------------
export type GapResponse = WellnessSchemas["GapResponse"];

// --- Activities -------------------------------------------------------------
export type ActivityResponse = WellnessSchemas["ActivityResponse"];
export type ActivityStep = WellnessSchemas["ActivityStep"];

// --- Prompts ----------------------------------------------------------------
export type FeedbackRequest = WellnessSchemas["FeedbackRequest"];
export type PromptResponse = WellnessSchemas["PromptResponse"];

// --- Gamification -----------------------------------------------------------
export type RankTier = WellnessSchemas["RankTier"];
export type PlayerStateResponse = WellnessSchemas["PlayerStateResponse"];
export type BadgeResponse = WellnessSchemas["BadgeResponse"];
export type MilestoneResponse = WellnessSchemas["MilestoneResponse"];
export type LeaderboardEntry = WellnessSchemas["LeaderboardEntry"];

// --- Social -----------------------------------------------------------------
export type FeedItemType = WellnessSchemas["FeedItemType"];
export type FeedItemResponse = WellnessSchemas["FeedItemResponse"];
export type SocialProfileResponse = WellnessSchemas["SocialProfileResponse"];
export type UpsertSocialProfileRequest =
  WellnessSchemas["UpsertSocialProfileRequest"];
export type FollowerResponse = WellnessSchemas["FollowerResponse"];
export type FollowResponse = WellnessSchemas["FollowResponse"];

// --- Errors -----------------------------------------------------------------
export type ProblemDetails = WellnessSchemas["ProblemDetails"];
export type HttpValidationProblemDetails =
  WellnessSchemas["HttpValidationProblemDetails"];

// --- OpenAPI document -------------------------------------------------------

/**
 * Minimal structural shape of an OpenAPI 3.x document. Deliberately loose — the
 * fully typed surface lives in `paths`/`components`/`operations`; this exists so
 * `wellnessOpenApiDocument` has a small, stable `.d.ts` instead of a giant
 * inferred JSON literal type.
 */
export interface WellnessOpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * The Wellness API's OpenAPI document, bundled from the API's committed
 * `services/Devngn.Wellness.Api/openapi/v1.json`. Regenerated (and drift-guarded)
 * by `pnpm --filter @devngn/wellness-types generate` — do not edit by hand.
 */
export const wellnessOpenApiDocument =
  openApiDocument as unknown as WellnessOpenApiDocument;
