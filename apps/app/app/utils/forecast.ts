// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  ActivityResponse,
  BodyArea,
  FitnessBaseline,
  GoalCategory,
  IntensityLevel,
} from "~/types/wellness";

/**
 * Client-side mirror of the server's deterministic PromptMatcher
 * (services/Devngn.Wellness.Api/Prompts/PromptMatcher.cs). Because the server's
 * selection is pure and stable, the app can preview the most-likely activity for
 * an upcoming free-time gap without asking the API to persist a prompt.
 *
 * Faithfully reproduced: the equipment-subset + duration hard filters, the
 * intensity match bonus, the sedentary/high penalty, goal-alignment bonus, and
 * the (score desc, duration asc, slug ordinal asc) tiebreak. The only omitted
 * signal is the "variety" bonus, which needs live prompt history; its effect is
 * a single point, so predictions stay accurate. Treat the result as "likely",
 * not guaranteed.
 */

const INTENSITY_ORDER: Record<IntensityLevel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

const INTENSITY_EXACT_BONUS = 4;
const INTENSITY_NEAR_BONUS = 2;
const SEDENTARY_HIGH_PENALTY = 3;
const GOAL_ALIGNMENT_BONUS = 3;

/** Which body areas each goal category rewards — mirrors GoalAffinity server-side. */
const GOAL_AFFINITY: Record<GoalCategory, ReadonlyArray<BodyArea>> = {
  Mobility: ["Full", "Neck", "Back", "Wrists", "Hips", "Ankles"],
  Strength: ["Upper", "Lower", "Core", "Full"],
  Breathing: ["Breath"],
  Posture: ["Posture", "Back", "Neck"],
  CardioLight: ["Full", "Lower"],
};

export interface PredictContext {
  preferredIntensity?: IntensityLevel | null;
  fitnessBaseline?: FitnessBaseline | null;
  goalCategories: ReadonlyArray<GoalCategory>;
}

function alignsWithGoals(area: BodyArea, goals: ReadonlyArray<GoalCategory>): boolean {
  for (const goal of goals) {
    if (GOAL_AFFINITY[goal]?.includes(area)) {
      return true;
    }
  }
  return false;
}

function isEquipmentSubset(
  required: ReadonlyArray<string>,
  available: ReadonlySet<string>,
): boolean {
  return required.every((tag) => available.has(tag));
}

function score(activity: ActivityResponse, ctx: PredictContext): number {
  let value = 0;

  if (ctx.preferredIntensity) {
    const diff = Math.abs(
      INTENSITY_ORDER[activity.intensity] - INTENSITY_ORDER[ctx.preferredIntensity],
    );
    value += diff === 0 ? INTENSITY_EXACT_BONUS : diff === 1 ? INTENSITY_NEAR_BONUS : 0;

    if (ctx.fitnessBaseline === "Sedentary" && activity.intensity === "High") {
      value -= SEDENTARY_HIGH_PENALTY;
    }
  }

  if (alignsWithGoals(activity.bodyArea, ctx.goalCategories)) {
    value += GOAL_ALIGNMENT_BONUS;
  }

  return value;
}

/**
 * Predicts the activity the engine would most likely deliver into a gap of the
 * given length, or null when nothing in the catalog fits.
 */
export function predictActivity(
  gapDurationSeconds: number,
  catalog: ReadonlyArray<ActivityResponse>,
  equipmentTags: ReadonlyArray<string>,
  ctx: PredictContext,
): ActivityResponse | null {
  const available = new Set(equipmentTags);

  const candidates = catalog
    .filter((a) => Number(a.durationSeconds) <= gapDurationSeconds)
    .filter((a) => isEquipmentSubset(a.equipmentTags, available))
    .map((a) => ({ activity: a, s: score(a, ctx) }))
    .sort((x, y) => {
      if (y.s !== x.s) return y.s - x.s;
      const dx = Number(x.activity.durationSeconds);
      const dy = Number(y.activity.durationSeconds);
      if (dx !== dy) return dx - dy;
      return x.activity.slug < y.activity.slug ? -1 : x.activity.slug > y.activity.slug ? 1 : 0;
    });

  return candidates.length > 0 ? candidates[0]!.activity : null;
}

/** Small stable string hash (FNV-1a) for deterministic surprise selection. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Decides whether a forecast slot is intentionally kept a surprise. The soonest
 * gap (index 0) is always revealed so you know what's next; roughly one in three
 * of the rest are withheld, chosen deterministically from the gap start so the
 * forecast stays stable between renders.
 */
export function isSurpriseGap(startUtc: string, index: number): boolean {
  if (index === 0) return false;
  return hash(startUtc) % 3 === 0;
}
