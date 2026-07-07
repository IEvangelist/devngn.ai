// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Global Vitest setup for the @devngn/app unit/component test suite.
 * Runs once per worker before any tests in that worker.
 */
import { setActivePinia, createPinia } from "pinia";

// ── Fake globals that happy-dom doesn't provide ───────────────────────────────

// Prevent useTauri() from ever returning true in unit tests.
// The window.__TAURI_INTERNALS__ property must be absent (not undefined, but
// genuinely absent from `window`) for the `in` check to return false.
// Tests that need to simulate Tauri context stub it individually via vi.stubGlobal.
delete (window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"];

// Provide a minimal Notification stub so web-path notification code can run.
// Individual tests that need to assert notification calls replace this with a spy.
if (!("Notification" in window)) {
  const NotificationStub = function (
    this: Notification,
    _title: string,
    _opts?: NotificationOptions,
  ) {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    value: "default",
    writable: true,
    configurable: true,
  });
  Object.defineProperty(NotificationStub, "requestPermission", {
    value: async () => "default" as NotificationPermission,
    writable: true,
    configurable: true,
  });
  vi.stubGlobal("Notification", NotificationStub);
}

// ── Per-test Pinia reset ──────────────────────────────────────────────────────

beforeEach(() => {
  // Fresh Pinia instance per test — prevents state leaking between tests.
  setActivePinia(createPinia());

  // Reset the module-level toast counter by clearing toasts list through the
  // composable (dismiss all). The counter continues incrementing across tests
  // but IDs are unique, so assertions on toast content / count remain reliable.
  // (The ref is module-level and can only be cleaned up by dismissing.)
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
