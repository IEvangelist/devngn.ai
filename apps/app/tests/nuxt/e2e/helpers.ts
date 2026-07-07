// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Playwright e2e test suite: App shell load and unauthenticated state.
 *
 * Mocking strategy:
 *  - All /v1/** requests are intercepted by page.route() and fulfilled with
 *    fixture JSON so the backend does not need to be running.
 *  - Authentication state is injected via localStorage before navigation
 *    (auth store reads devngn_token on init()) for authenticated scenarios.
 *  - Un-authenticated tests use no token; the sign-in affordance should appear.
 */

import { test, expect } from "@playwright/test";
import {
  mockUser,
  mockPlayerState,
  mockLeaderboard,
  mockBadges,
  mockFeed,
  mockFollowers,
  mockFollowing,
  mockSocialProfile,
  mockMilestones,
} from "../fixtures/wellness";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Register default API route mocks that respond to all /v1/** requests.
 *
 * IMPORTANT: Playwright matches routes in LIFO order (most recently registered
 * wins). The catch-all must be registered FIRST so specific routes, which are
 * registered afterwards, take precedence over it.
 */
async function mockAllApiRoutes(page: import("@playwright/test").Page) {
  // ── Catch-all (registered first = lowest priority) ──────────────────────────
  // Catch-all for any other /v1/ endpoints (e.g. goals, activities).
  // Must be first so specific routes below shadow it.
  await page.route("**/v1/**", (route) => route.fulfill({ status: 204, body: "" }));

  // ── Specific routes (registered last = highest priority) ────────────────────
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ status: 200, json: mockUser }),
  );
  await page.route("**/v1/gamification/me", (route) =>
    route.fulfill({ status: 200, json: mockPlayerState }),
  );
  await page.route("**/v1/gamification/badges", (route) =>
    route.fulfill({ status: 200, json: mockBadges }),
  );
  await page.route("**/v1/gamification/milestones", (route) =>
    route.fulfill({ status: 200, json: mockMilestones }),
  );
  await page.route("**/v1/gamification/leaderboard", (route) =>
    route.fulfill({ status: 200, json: mockLeaderboard }),
  );
  await page.route("**/v1/social/profile", (route) =>
    route.fulfill({ status: 200, json: mockSocialProfile }),
  );
  await page.route("**/v1/social/feed", (route) =>
    route.fulfill({ status: 200, json: mockFeed }),
  );
  await page.route("**/v1/social/followers", (route) =>
    route.fulfill({ status: 200, json: mockFollowers }),
  );
  await page.route("**/v1/social/following", (route) =>
    route.fulfill({ status: 200, json: mockFollowing }),
  );
  // SSE stream: return 200 with empty body so the store doesn't hang
  await page.route("**/v1/prompts/stream**", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "",
    }),
  );
}

/**
 * Inject a mock auth token into localStorage AND patch window.fetch to
 * intercept /v1/auth/me so auth.init() succeeds without a real server.
 *
 * Why: Playwright's page.route() handlers are set up before goto(), but the
 * layout's onMounted fires very early and there can be a narrow race window on
 * some platforms. Patching window.fetch in an addInitScript is more reliable
 * because the patch exists from the very first JS execution context.
 */
async function injectAuthToken(page: import("@playwright/test").Page) {
  await page.addInitScript((userData: string) => {
    // 1. Set the token so auth.init() reads it from localStorage.
    localStorage.setItem("devngn_token", "test-access-token-e2e");

    // 2. Patch window.fetch to intercept /v1/auth/me before any network call.
    //    This ensures refreshUser() returns the mock user even if Playwright's
    //    route handler hasn't fired yet for this early request.
    const _originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("/v1/auth/me")) {
        return new Response(userData, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return _originalFetch(input, init);
    };
  }, JSON.stringify(mockUser));
}

export { mockAllApiRoutes, injectAuthToken };
export {
  mockUser, mockPlayerState, mockLeaderboard, mockBadges, mockFeed,
  mockFollowers, mockFollowing, mockSocialProfile, mockMilestones,
};
