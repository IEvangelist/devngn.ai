// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * e2e: Navigation across all pages.
 * Verifies that every nav link renders its target page's heading.
 */

import { test, expect } from "@playwright/test";
import { mockAllApiRoutes, injectAuthToken } from "./helpers";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page);
    await mockAllApiRoutes(page);
    await page.goto("/");
    await page.waitForTimeout(300);
  });

  const pages = [
    { label: /interruptions/i, heading: /interruptions/i, href: "/interruptions" },
    { label: /goals/i,         heading: /goal title/i,    href: "/goals" },
    { label: /badges/i,        heading: /badges/i,        href: "/badges" },
    { label: /milestones/i,    heading: /milestones/i,    href: "/milestones" },
    { label: /leaderboard/i,   heading: /leaderboard/i,   href: "/leaderboard" },
    { label: /social/i,        heading: /social/i,        href: "/social" },
    { label: /settings/i,      heading: /settings/i,      href: "/settings" },
  ] as const;

  for (const { label, heading, href } of pages) {
    test(`navigates to ${href} and renders heading`, async ({ page }) => {
      // On mobile viewports (≤720px) the sidebar is display:none; open the mobile menu first.
      const sidebar = page.getByRole("complementary", { name: /primary navigation/i });
      const isMobile = !(await sidebar.isVisible());

      let navLink: import("@playwright/test").Locator;
      if (isMobile) {
        await page.getByRole("button", { name: /toggle menu/i }).click();
        navLink = page
          .getByRole("navigation", { name: /mobile navigation/i })
          .getByRole("link", { name: label })
          .first();
      } else {
        navLink = page
          .getByRole("navigation", { name: /main/i })
          .getByRole("link", { name: label })
          .first();
      }

      await navLink.click();
      await expect(page).toHaveURL(new RegExp(href.replace("/", "")));
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    });
  }

  test("direct URL navigation to /badges renders the Badges page", async ({ page }) => {
    await page.goto("/badges");
    await expect(page.getByRole("heading", { name: /badges/i, level: 1 })).toBeVisible();
  });

  test("Today page is the root (/) and renders its heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /today/i, level: 1 })).toBeVisible();
  });
});
