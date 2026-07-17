import type { Database, DatabaseRow } from "../lib/database.js";
import { isObject, isString, type JsonObject } from "../lib/json.js";

export const CONSENT_VERSION = "1.0";
export const CONSENT_TEXT = `devngn.ai wellness — Consent v1.0

By accepting, you allow devngn.ai to store the following data so it can deliver
personalized wellness prompts during your schedule gaps:

  * A self-reported wellness profile (optional age range, height, weight,
    fitness baseline, preferred intensity, limitations, time-of-day preference).
  * The wellness goals you set (title, category, target metric, start/end dates).
  * The equipment you have registered as available.

This data is stored only on the devngn.ai wellness service and is never shared
with third parties. You can revoke this consent at any time via
DELETE /v1/consent, which permanently deletes your wellness profile, goals,
equipment, schedules, prompt history, gamification, and social data. Revoking
consent does not delete your devngn.ai account itself.`;

export const BODY_AREAS = [
  "Full",
  "Upper",
  "Lower",
  "Core",
  "Neck",
  "Back",
  "Wrists",
  "Hips",
  "Ankles",
  "Breath",
  "Posture",
] as const;

export const INTENSITY_LEVELS = ["Low", "Medium", "High"] as const;
export const FITNESS_BASELINES = [
  "Unspecified",
  "Sedentary",
  "Light",
  "Moderate",
  "Active",
] as const;
export const GOAL_CATEGORIES = [
  "Mobility",
  "Strength",
  "Breathing",
  "Posture",
  "CardioLight",
] as const;
export const SCHEDULE_SOURCE_TYPES = ["User", "Google", "Microsoft"] as const;
export const SCHEDULE_SOURCE_STATUSES = [
  "Connected",
  "NeedsReconnect",
  "Disabled",
  "Error",
  "PendingConnection",
] as const;
export const DELIVERY_CHANNELS = ["Vscode", "Cli", "Web", "App"] as const;

export type BodyArea = (typeof BODY_AREAS)[number];
export type IntensityLevel = (typeof INTENSITY_LEVELS)[number];
export type FitnessBaseline = (typeof FITNESS_BASELINES)[number];
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type ScheduleSourceType = (typeof SCHEDULE_SOURCE_TYPES)[number];
export type ScheduleSourceStatus = (typeof SCHEDULE_SOURCE_STATUSES)[number];
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isSafeReturnPath(
  value: string | null,
  trustedOrigin: string,
): boolean {
  if (value === null || value.length === 0) {
    return true;
  }
  if (!value.startsWith("/") || /[\u0000-\u001f\u007f\\]/u.test(value)) {
    return false;
  }
  try {
    return new URL(value, `${trustedOrigin}/`).origin === trustedOrigin;
  } catch {
    return false;
  }
}

export function requiredTrimmedString(
  object: JsonObject,
  name: string,
  maximumLength: number,
): string | undefined {
  const value = object[name];
  if (!isString(value)) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength
    ? trimmed
    : undefined;
}

export function optionalTrimmedString(
  object: JsonObject,
  name: string,
  maximumLength: number,
): string | null | undefined {
  const value = object[name];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!isString(value) || value.length > maximumLength) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function enumValue<T extends readonly string[]>(
  object: JsonObject,
  name: string,
  values: T,
): T[number] | undefined {
  const value = object[name];
  if (!isString(value)) {
    return undefined;
  }
  return values.find((candidate) => candidate === value);
}

export function enumQueryValue<T extends readonly string[]>(
  value: string | null,
  values: T,
): T[number] | undefined {
  if (value === null) {
    return undefined;
  }
  return values.find(
    (candidate) => candidate.toLowerCase() === value.toLowerCase(),
  );
}

export function dateOnly(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export function utcDateTime(value: string): Date | undefined {
  if (
    !(
      value.endsWith("Z") ||
      value.endsWith("+00:00") ||
      value.endsWith("-00:00")
    )
  ) {
    return undefined;
  }
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

export function parseDateTime(value: string | null): Date | undefined {
  if (value === null) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function objectFromRow(
  row: DatabaseRow,
  field = "result",
): JsonObject | undefined {
  const value = row[field];
  return isObject(value) ? value : undefined;
}

export function stringFromRow(
  row: DatabaseRow | undefined,
  field: string,
): string | undefined {
  const value = row?.[field];
  return isString(value) ? value : undefined;
}

export function numberFromRow(
  row: DatabaseRow | undefined,
  field: string,
): number | undefined {
  const value = row?.[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function nullableStringFromRow(
  row: DatabaseRow | undefined,
  field: string,
): string | null | undefined {
  const value = row?.[field];
  if (value === null) {
    return null;
  }
  return isString(value) ? value : undefined;
}

export interface ConsentGateState {
  readonly status: "current" | "required" | "stale";
  readonly acceptedVersion?: string;
}

export async function hasCurrentConsent(
  database: Database,
  userId: string,
): Promise<ConsentGateState> {
  const rows = await database.query(
    "SELECT version FROM consent_records WHERE user_id = $1::uuid",
    [userId],
  );
  const version = stringFromRow(rows[0], "version");
  if (version === undefined) {
    return { status: "required" };
  }
  return version === CONSENT_VERSION
    ? { status: "current", acceptedVersion: version }
    : { status: "stale", acceptedVersion: version };
}

export function normalizeGitHubId(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (isString(value)) {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : value;
  }
  return undefined;
}
