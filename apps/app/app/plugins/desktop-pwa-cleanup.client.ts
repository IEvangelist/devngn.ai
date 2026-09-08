// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Removes PWA state left by older desktop builds. Tauri bundles no longer
 * register a service worker, so embedded frontend assets always match the
 * installed executable. The web/PWA build is unaffected.
 */
export async function clearDesktopPwaState(): Promise<void> {
  if (!useTauri()) return;

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }
}

export default defineNuxtPlugin({
  name: "devngn:desktop-pwa-cleanup",
  async setup() {
    await clearDesktopPwaState();
  },
});
