import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],

  webServer: {
    command:
      "pnpm run build:deps && pnpm exec astro dev --host 127.0.0.1 --port 4390",
    url: "http://127.0.0.1:4390",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  use: {
    baseURL: "http://127.0.0.1:4390",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
