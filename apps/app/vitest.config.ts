// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Vitest configuration for @devngn/app.
 *
 * Environment choice — `nuxt` (via @nuxt/test-utils/config):
 *   All stores and composables rely on Nuxt auto-imports (defineStore, ref,
 *   computed, useRuntimeConfig, etc.) that are injected at build time by Nuxt's
 *   Vite plugin. Running them in a plain happy-dom or jsdom environment would
 *   leave those globals undefined. The nuxt environment:
 *     1. Processes nuxt.config.ts (including @pinia/nuxt, @nuxtjs/i18n modules).
 *     2. Sets up the #imports virtual module so auto-imports resolve at test time.
 *     3. Provides useRuntimeConfig() with values from nuxt.config.ts.
 *   We choose happy-dom as the DOM layer (lighter than jsdom, sufficient for
 *   Vue component rendering and basic browser-API coverage).
 *
 *   PWA virtual-module workaround:
 *   @vite-pwa/nuxt registers Vite virtual modules (virtual:pwa-register/vue,
 *   virtual:pwa-info, virtual:pwa-assets/*) that Vite resolves to non-file
 *   URLs (file:///@vite-plugin-pwa/virtual:…). Node.js's fileURLToPath() rejects
 *   these, crashing the module runner for ALL tests. The fix is a pre-enforcement
 *   Vite plugin added here that intercepts every pwa-related virtual ID before
 *   the real @vite-pwa plugin handles it, and returns a lightweight stub instead.
 *   The @nuxt/test-utils resolveConfig() deep-merges our config's `plugins` array
 *   at the head of the resolved plugins list, so our enforce:'pre' plugin runs
 *   first regardless of the PWA plugin's own enforcement level.
 *
 *   Trade-off: each worker starts a Nuxt Vite transform context — adds ~2-3s
 *   cold-start overhead per worker. Acceptable for a focused store + component
 *   suite; use `pool: 'forks'` to parallelise across CPU cores.
 */
import { defineVitestConfig } from "@nuxt/test-utils/config";
import type { Plugin } from "vite";

/** Inline stub returned for every PWA virtual module in tests. */
const PWA_STUB = `
import { ref } from 'vue';
export const useRegisterSW = () => ({
  needRefresh: ref(false),
  offlineReady: ref(false),
  updateServiceWorker: async () => {},
});
export const usePWA = () => ({
  needRefresh: ref(false),
  offlineReady: ref(false),
  swActivated: ref(false),
  registrationError: ref(undefined),
  updateServiceWorker: async () => {},
  cancelPrompt: async () => {},
  getSWRegistration: () => undefined,
});
export default {};
`;

/** Pre-enforcement plugin: intercepts @vite-pwa virtual modules before they
 *  reach the real plugin whose resolved IDs are not valid Node.js file paths. */
const mockPwaPlugin: Plugin = {
  name: "devngn:mock-pwa-virtual",
  enforce: "pre",
  resolveId(id: string) {
    if (
      id.startsWith("virtual:pwa-") ||
      id.startsWith("virtual:pwa-register") ||
      id.includes("pwa-register/vue") ||
      id.includes("@vite-plugin-pwa/virtual") ||
      id.startsWith("virtual:pwa-assets/") ||
      id === "virtual:pwa-info"
    ) {
      return "\0devngn-pwa-stub";
    }
  },
  load(id: string) {
    if (id === "\0devngn-pwa-stub") {
      return PWA_STUB;
    }
  },
};

export default defineVitestConfig({
  plugins: [mockPwaPlugin],
  test: {
    globals: true,
    environment: "nuxt",
    environmentOptions: {
      nuxt: {
        domEnvironment: "happy-dom",
        mock: {
          intersectionObserver: true,
          indexedDb: true,
        },
      },
    },
    setupFiles: ["./tests/nuxt/setup.ts"],
    include: ["tests/nuxt/unit/**/*.test.ts"],
    pool: "forks",
  },
});
