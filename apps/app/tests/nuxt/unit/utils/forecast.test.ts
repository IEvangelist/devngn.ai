// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { predictActivity, isSurpriseGap } from "../../../../app/utils/forecast";
import type { ActivityResponse } from "../../../../app/types/wellness";

function activity(partial: Partial<ActivityResponse> & Pick<ActivityResponse, "slug">): ActivityResponse {
  return {
    id: partial.id ?? partial.slug,
    slug: partial.slug,
    title: partial.title ?? partial.slug,
    description: partial.description ?? "",
    bodyArea: partial.bodyArea ?? "Full",
    intensity: partial.intensity ?? "Low",
    durationSeconds: partial.durationSeconds ?? 30,
    equipmentTags: partial.equipmentTags ?? [],
    animationProvider: "local",
    animationAssetId: partial.slug,
    licenseAttribution: null,
  };
}

describe("predictActivity (matcher mirror)", () => {
  it("excludes activities longer than the gap", () => {
    const catalog = [
      activity({ slug: "long", durationSeconds: 120 }),
      activity({ slug: "short", durationSeconds: 40 }),
    ];
    const pick = predictActivity(60, catalog, [], { goalCategories: [] });
    expect(pick?.slug).toBe("short");
  });

  it("excludes activities needing equipment the user lacks", () => {
    const catalog = [
      activity({ slug: "band", durationSeconds: 30, equipmentTags: ["bands-light"] }),
      activity({ slug: "bodyweight", durationSeconds: 30 }),
    ];
    const pick = predictActivity(60, catalog, [], { goalCategories: [] });
    expect(pick?.slug).toBe("bodyweight");
  });

  it("includes equipment activities once the tag is owned", () => {
    const catalog = [activity({ slug: "band", durationSeconds: 30, equipmentTags: ["bands-light"] })];
    const pick = predictActivity(60, catalog, ["bands-light"], { goalCategories: [] });
    expect(pick?.slug).toBe("band");
  });

  it("prefers the intensity closest to the user's preference", () => {
    const catalog = [
      activity({ slug: "low", intensity: "Low", durationSeconds: 30 }),
      activity({ slug: "high", intensity: "High", durationSeconds: 30 }),
    ];
    const pick = predictActivity(60, catalog, [], {
      preferredIntensity: "High",
      goalCategories: [],
    });
    expect(pick?.slug).toBe("high");
  });

  it("penalizes High intensity for sedentary users", () => {
    const catalog = [
      activity({ slug: "high", intensity: "High", durationSeconds: 30 }),
      activity({ slug: "medium", intensity: "Medium", durationSeconds: 30 }),
    ];
    // Preference High would normally pick "high", but the sedentary penalty
    // (-3) drops it below the near-miss Medium (+2).
    const pick = predictActivity(60, catalog, [], {
      preferredIntensity: "High",
      fitnessBaseline: "Sedentary",
      goalCategories: [],
    });
    expect(pick?.slug).toBe("medium");
  });

  it("rewards activities that align with a goal's body areas", () => {
    const catalog = [
      activity({ slug: "core", bodyArea: "Core", durationSeconds: 30 }),
      activity({ slug: "neck", bodyArea: "Neck", durationSeconds: 30 }),
    ];
    const pick = predictActivity(60, catalog, [], { goalCategories: ["Strength"] });
    expect(pick?.slug).toBe("core");
  });

  it("breaks ties by shorter duration then slug order", () => {
    const catalog = [
      activity({ slug: "b-move", durationSeconds: 45 }),
      activity({ slug: "a-move", durationSeconds: 30 }),
      activity({ slug: "c-move", durationSeconds: 30 }),
    ];
    const pick = predictActivity(60, catalog, [], { goalCategories: [] });
    // Equal score -> shortest (30s) -> slug ordinal -> "a-move".
    expect(pick?.slug).toBe("a-move");
  });

  it("returns null when nothing fits", () => {
    const catalog = [activity({ slug: "long", durationSeconds: 999 })];
    expect(predictActivity(60, catalog, [], { goalCategories: [] })).toBeNull();
  });

  it("coerces string-serialized durations", () => {
    const catalog = [activity({ slug: "s", durationSeconds: "40" as unknown as number })];
    expect(predictActivity(60, catalog, [], { goalCategories: [] })?.slug).toBe("s");
  });
});

describe("isSurpriseGap", () => {
  it("never hides the soonest gap", () => {
    expect(isSurpriseGap("2026-01-01T10:00:00.000Z", 0)).toBe(false);
  });

  it("is deterministic for the same start time", () => {
    const start = "2026-06-15T14:30:00.000Z";
    expect(isSurpriseGap(start, 3)).toBe(isSurpriseGap(start, 3));
  });
});
