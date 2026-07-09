// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { EquipmentCategory } from "~/types/wellness";

/**
 * Maps equipment tags and categories to the vendored Phosphor glyph names in
 * AppIcon. Shared so the equipment picker and the interruption "uses your gear"
 * badge draw the exact same icon for a given piece of gear.
 */

const TAG_ICONS: Record<string, string> = {
  "under-desk-treadmill": "sneaker-move",
  treadmill: "sneaker-move",
  "stationary-bike": "bicycle",
  "jump-rope": "heartbeat",
  "free-weights": "barbell",
  kettlebell: "barbell",
  "weight-bench": "barbell",
  "pull-up-bar": "barbell",
  "bands-light": "barbell",
  mat: "flower-lotus",
  "foam-roller": "flower-lotus",
  "standing-desk": "desk",
  "chair-only": "armchair",
};

const CATEGORY_ICONS: Record<EquipmentCategory, string> = {
  Cardio: "heartbeat",
  Strength: "barbell",
  Mobility: "flower-lotus",
  Desk: "desk",
};

export function useEquipmentIcons() {
  /** Icon for a gear tag, falling back to a neutral barbell. */
  function equipmentIcon(tag: string): string {
    return TAG_ICONS[tag] ?? "barbell";
  }

  /** Icon for an equipment category. */
  function categoryIcon(category: EquipmentCategory): string {
    return CATEGORY_ICONS[category] ?? "barbell";
  }

  return { equipmentIcon, categoryIcon };
}
