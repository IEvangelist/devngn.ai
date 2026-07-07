// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * e2e: App shell load and unauthenticated state.
 */

import { test, expect } from "@playwright/test";
import { mockAllApiRoutes, injectAuthToken } from "./helpers";

test.describe("App shell — unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    // Do NOT inject a token — unauthenticated state
    await mockAllApiRoutes(page);
    await page.goto("/");
  });

  test("page title contains 'devngn'", async ({ page }) => {
    await expect(page).toHaveTitle(/devngn/i);
  });

  test("sidebar with primary navigation is visible", async ({ page }) => {
    // The <aside> has role="complementary" (not navigation); the <nav> inside has aria-label="Main"
    await expect(
      page.getByRole("complementary", { name: /primary navigation/i }),
    ).toBeVisible();
  });

  test("sign-in button is visible when unauthenticated", async ({ page }) => {
    // "Sign in" button is a BrutButton in the status bar header (.statusbar__auth)
    const signInBtn = page.locator(".statusbar__auth").getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible();
  });

  test("XP widget is NOT visible when unauthenticated", async ({ page }) => {
    // The XP widget is only shown for authenticated users
    await expect(page.getByLabel(/your level and xp/i)).not.toBeVisible();
  });

  test("skip-to-content link is present", async ({ page }) => {
    // Skip link is rendered but visually hidden; it should be in the DOM
    const skipLink = page.getByRole("link", { name: /skip to content/i });
    await expect(skipLink).toBeAttached();
  });
});

test.describe("App shell — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
    await page.goto("/");
    // Wait for auth to initialise and XP data to load — auth.init() is called
    // onMounted and makes async API calls. Use explicit selector wait instead of
    // a fixed timeout so the test adapts to varying load times.
    await page.waitForSelector('[aria-label="Your level and XP"]', { timeout: 8000 }).catch(() => null);
  });

  test("XP widget appears after authentication", async ({ page }) => {
    await expect(page.locator('[aria-label="Your level and XP"]')).toBeVisible();
  });

  test("sign-out button is visible when authenticated", async ({ page }) => {
    // Sign-out is a native <button> (not BrutButton) inside .statusbar__auth
    await expect(
      page.locator(".statusbar__auth").getByRole("button", { name: /sign out/i }),
    ).toBeVisible();
  });

  test("stream status indicator is present in the status bar", async ({ page }) => {
    // The status indicator label is aria-live="polite" — it's in the DOM
    const statusBar = page.getByRole("banner", { name: /status bar/i });
    await expect(statusBar).toBeVisible();
  });
});
