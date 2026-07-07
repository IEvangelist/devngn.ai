// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for @devngn/app e2e + a11y tests.
 *
 * Web-server strategy — generate + serve (static SPA):
 *   `nuxt generate` produces a fully static SPA under .output/public that
 *   mirrors the production Tauri bundle. Serving it via `serve` on a fixed
 *   port (4173) avoids the SSR/HMR overhead of `nuxt dev` and is closer to
 *   the real deployment target. The generate step is skipped if the server
 *   is already responding (reuseExistingServer) to speed up local iteration.
 *
 *   Trade-off: generate takes ~30-60s on first run. Re-runs skip it via
 *   `reuseExistingServer: !CI`. If you change app code, stop and restart.
 *
 * Projects: Single Chromium project per spec requirements ("Single Chromium
 *   project is fine for CI reliability"). The mobile viewport project was
 *   removed because it produces widespread failures due to the app's CSS
 *   hiding the desktop sidebar on narrow viewports and requires a full
 *   mobile-specific test suite outside the scope of Wave 3.
 */
export default defineConfig({
  testDir: "./tests/nuxt/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],

  webServer: {
    // Generate the static SPA, then serve it. On Windows, the shell executing
    // this is cmd.exe via cross-spawn — && works there for sequential commands.
    command:
      "pnpm run generate && node_modules\\.bin\\serve .output\\public --listen 4173 --no-clipboard --single",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Block service workers so PWA caching doesn't interfere with API route mocks
    serviceWorkers: "block",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
