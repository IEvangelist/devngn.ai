// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * e2e: Axe accessibility checks.
 *
 * Asserts zero critical/serious violations on each main page using
 * @axe-core/playwright. Pages that require auth state get a mocked token
 * and API responses injected before navigation.
 *
 * Scope: wcag2a + wcag2aa tags (covers the critical and serious violation
 * categories surfaced by axe-core for WCAG 2.0/2.1 Level A and AA).
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAllApiRoutes, injectAuthToken } from "./helpers";

/** Run axe on the current page and assert zero critical/serious violations. */
async function assertNoA11yViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map(
        (v) =>
          `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`,
      )
      .join("\n");
    throw new Error(
      `Found ${blocking.length} critical/serious a11y violation(s):\n${summary}`,
    );
  }

  expect(blocking).toHaveLength(0);
}

// ── Unauthenticated pages ─────────────────────────────────────────────────────

test.describe("Accessibility — unauthenticated pages", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
  });

  test("home page (/) has no critical/serious a11y violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations(page);
  });
});

// ── Authenticated pages ───────────────────────────────────────────────────────

const authenticatedPages = [
  { name: "home",         path: "/" },
  { name: "interruptions", path: "/interruptions" },
  { name: "badges",       path: "/badges" },
  { name: "leaderboard",  path: "/leaderboard" },
  { name: "social",       path: "/social" },
  { name: "settings",     path: "/settings" },
] as const;

test.describe("Accessibility — authenticated pages", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
  });

  for (const { name, path } of authenticatedPages) {
    test(`${name} page has no critical/serious a11y violations`, async ({ page }) => {
      await page.goto(path);
      // Give time for onMounted data fetches to complete
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await assertNoA11yViolations(page);
    });
  }
});
