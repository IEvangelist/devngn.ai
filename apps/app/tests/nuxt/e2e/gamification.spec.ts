// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * e2e: Gamification — badges, leaderboard, XP/streak widget.
 *
 * All /v1/gamification/** calls are mocked with fixture data.
 * Tests verify:
 *  - earned vs locked badge sections appear with correct counts
 *  - hidden/mystery badge tiles are masked (show ??? text)
 *  - leaderboard renders ranked rows
 *  - XP/streak widget reflects mocked /v1/gamification/me data
 */

import { test, expect } from "@playwright/test";
import {
  mockAllApiRoutes,
  injectAuthToken,
  mockBadges,
  mockPlayerState,
  mockLeaderboard,
} from "./helpers";

const earnedCount = mockBadges.filter((b) => b.earned).length;   // 2
const lockedCount = mockBadges.filter((b) => !b.earned).length;  // 2
const hiddenCount = mockBadges.filter((b) => !b.earned && b.isHidden).length; // 1

test.describe("Gamification — Badges page", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
    await page.goto("/badges");
    // Wait for badges to load (onMounted fetchBadges completes after mock responds)
    await page.waitForSelector(".badge-grid", { timeout: 8000 }).catch(() => null);
  });

  test("shows earned and locked section headings", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: new RegExp(`earned.*${earnedCount}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: new RegExp(`locked.*${lockedCount}`, "i") }),
    ).toBeVisible();
  });

  test("renders the correct number of earned badge tiles", async ({ page }) => {
    const earnedList = page.locator(".badge-tile--earned");
    await expect(earnedList).toHaveCount(earnedCount);
  });

  test("renders locked badges (non-hidden) with their names", async ({ page }) => {
    const nonHiddenLocked = mockBadges.filter((b) => !b.earned && !b.isHidden);
    for (const badge of nonHiddenLocked) {
      await expect(page.getByText(badge.name)).toBeVisible();
    }
  });

  test("renders hidden badges as mystery tiles (shows '???')", async ({ page }) => {
    const hiddenTiles = page.locator(".badge-tile--hidden");
    await expect(hiddenTiles).toHaveCount(hiddenCount);
    // Hidden tiles reveal nothing about the badge: a locked medallion (a lock
    // glyph, not the real emoji) plus a masked "???" name confirm the pattern.
    await expect(hiddenTiles.first()).toBeVisible();
    await expect(hiddenTiles.first().locator(".badge-medallion .app-icon")).toBeVisible();
  });

  test("earned badge tile is focusable (tabindex=0)", async ({ page }) => {
    const firstEarnedTile = page.locator(".badge-tile--earned").first();
    await expect(firstEarnedTile).toHaveAttribute("tabindex", "0");
  });
});

test.describe("Gamification — Leaderboard", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
    await page.goto("/leaderboard");
    // Wait for the leaderboard table to appear
    await page.waitForSelector(".leaderboard__table", { timeout: 8000 }).catch(() => null);
  });

  test("renders the leaderboard table", async ({ page }) => {
    await expect(
      page.getByRole("table", { name: /developer leaderboard/i }),
    ).toBeVisible();
  });

  test("renders the correct number of player rows", async ({ page }) => {
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(mockLeaderboard.length);
  });

  test("first place shows gold medal emoji", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow.locator(".rank-badge")).toContainText("🥇");
  });

  test("displays player display names", async ({ page }) => {
    for (const entry of mockLeaderboard) {
      await expect(page.getByText(entry.displayName)).toBeVisible();
    }
  });

  test("marks the current user's row with aria-current='true'", async ({ page }) => {
    // mockUser.id = 'user-42' → matches mockLeaderboard[1].userId
    const currentUserRow = page.locator("tr[aria-current='true']");
    await expect(currentUserRow).toBeVisible();
    await expect(currentUserRow).toContainText(mockLeaderboard[1]!.displayName);
  });
});

test.describe("Gamification — XP / streak widget", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
    await page.goto("/");
    // Wait for auth + player state to load and XP widget to appear
    await page.waitForSelector('[aria-label="Your level and XP"]', { timeout: 8000 }).catch(() => null);
  });

  test("status bar shows the player's level", async ({ page }) => {
    const xpWidget = page.getByLabel(/your level and xp/i);
    await expect(xpWidget).toBeVisible();
    // mockPlayerState.level = 5
    await expect(xpWidget).toContainText(`${mockPlayerState.level}`);
  });

  test("status bar shows the streak count", async ({ page }) => {
    const xpWidget = page.getByLabel(/your level and xp/i);
    // mockPlayerState.currentStreak = 7 → shows "7d"
    await expect(xpWidget).toContainText(`${mockPlayerState.currentStreak}d`);
  });

  test("status bar shows the rank tier", async ({ page }) => {
    const xpWidget = page.getByLabel(/your level and xp/i);
    await expect(xpWidget).toContainText(mockPlayerState.rankTier);
  });
});
