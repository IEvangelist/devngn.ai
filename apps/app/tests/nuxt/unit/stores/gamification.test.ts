// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Unit tests for useGamificationStore.
 *
 * Focuses on the pure computed selectors (earnedBadges, lockedBadges,
 * xpPercent, completedMilestones) and the fetch action error/state handling.
 * Network calls are intercepted via the stubbed global.fetch set up in setup.ts.
 */

import { setActivePinia, createPinia } from "pinia";
import {
  mockBadges,
  mockPlayerState,
  mockMilestones,
  mockLeaderboard,
} from "../../fixtures/wellness";

describe("useGamificationStore — computed selectors", () => {
  let store: ReturnType<typeof useGamificationStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useGamificationStore();
  });

  // ── earnedBadges ────────────────────────────────────────────────────────────

  it("earnedBadges returns only badges where earned === true", () => {
    store.badges = mockBadges;
    expect(store.earnedBadges).toHaveLength(2);
    expect(store.earnedBadges.every((b) => b.earned)).toBe(true);
  });

  it("earnedBadges is empty when no badges are earned", () => {
    store.badges = mockBadges.map((b) => ({ ...b, earned: false }));
    expect(store.earnedBadges).toHaveLength(0);
  });

  // ── lockedBadges ─────────────────────────────────────────────────────────────

  it("lockedBadges returns only badges where earned === false", () => {
    store.badges = mockBadges;
    expect(store.lockedBadges).toHaveLength(2);
    expect(store.lockedBadges.every((b) => !b.earned)).toBe(true);
  });

  it("lockedBadges includes hidden badges (isHidden flag)", () => {
    store.badges = mockBadges;
    const hidden = store.lockedBadges.filter((b) => b.isHidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.key).toBe("mystery-1");
  });

  it("earnedBadges + lockedBadges covers all badges", () => {
    store.badges = mockBadges;
    expect(store.earnedBadges.length + store.lockedBadges.length).toBe(
      mockBadges.length,
    );
  });

  // ── xpPercent ────────────────────────────────────────────────────────────────

  it("xpPercent returns 0 when playerState is null", () => {
    store.playerState = null;
    expect(store.xpPercent).toBe(0);
  });

  it("xpPercent computes correctly (250/500 → 50%)", () => {
    store.playerState = { ...mockPlayerState, xpIntoLevel: 250, xpForNextLevel: 500 };
    expect(store.xpPercent).toBe(50);
  });

  it("xpPercent rounds to the nearest integer", () => {
    store.playerState = { ...mockPlayerState, xpIntoLevel: 1, xpForNextLevel: 3 };
    expect(store.xpPercent).toBe(33);
  });

  it("xpPercent caps at 100 even if xpInto > xpForNext", () => {
    store.playerState = { ...mockPlayerState, xpIntoLevel: 600, xpForNextLevel: 500 };
    expect(store.xpPercent).toBe(100);
  });

  it("xpPercent returns 100 when xpForNextLevel is 0 (max level)", () => {
    store.playerState = { ...mockPlayerState, xpIntoLevel: 0, xpForNextLevel: 0 };
    expect(store.xpPercent).toBe(100);
  });

  // ── completedMilestones ──────────────────────────────────────────────────────

  it("completedMilestones returns only achieved milestones", () => {
    store.milestones = mockMilestones;
    expect(store.completedMilestones).toHaveLength(1);
    expect(store.completedMilestones[0]!.key).toBe("first-login");
  });

  it("completedMilestones is empty with no milestones", () => {
    store.milestones = [];
    expect(store.completedMilestones).toHaveLength(0);
  });
});

describe("useGamificationStore — async actions", () => {
  let store: ReturnType<typeof useGamificationStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useGamificationStore();
  });

  // ── fetchBadges ──────────────────────────────────────────────────────────────

  it("fetchBadges populates badges on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockBadges), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await store.fetchBadges();
    expect(store.badges).toHaveLength(mockBadges.length);
    expect(store.loadingBadges).toBe(false);
    expect(store.errorBadges).toBeNull();
  });

  it("fetchBadges sets errorBadges on network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    await store.fetchBadges();
    expect(store.errorBadges).toBe("Network error");
    expect(store.loadingBadges).toBe(false);
  });

  it("fetchBadges sets a generic error message for non-Error rejections", async () => {
    vi.mocked(fetch).mockRejectedValueOnce("oops");
    await store.fetchBadges();
    expect(store.errorBadges).toBe("Failed to load badges.");
  });

  // ── fetchPlayerState ──────────────────────────────────────────────────────────

  it("fetchPlayerState populates playerState on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockPlayerState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await store.fetchPlayerState();
    expect(store.playerState).toMatchObject({ level: 5, rankTier: "Gold" });
    expect(store.errorPlayer).toBeNull();
  });

  it("fetchPlayerState sets errorPlayer on failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("API down"));
    await store.fetchPlayerState();
    expect(store.errorPlayer).toBe("API down");
  });

  // ── fetchLeaderboard ─────────────────────────────────────────────────────────

  it("fetchLeaderboard populates leaderboard array", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockLeaderboard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await store.fetchLeaderboard();
    expect(store.leaderboard).toHaveLength(3);
  });

  // ── fetchAll ──────────────────────────────────────────────────────────────────

  it("fetchAll runs all four fetch actions in parallel", async () => {
    const mockJsonResponse = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    // fetchAll calls 4 endpoints; stub fetch to return appropriate mocks
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse(mockPlayerState))
      .mockResolvedValueOnce(mockJsonResponse(mockBadges))
      .mockResolvedValueOnce(mockJsonResponse(mockMilestones))
      .mockResolvedValueOnce(mockJsonResponse(mockLeaderboard));

    await store.fetchAll();

    expect(store.playerState?.level).toBe(5);
    expect(store.badges).toHaveLength(4);
    expect(store.milestones).toHaveLength(3);
    expect(store.leaderboard).toHaveLength(3);
  });
});
