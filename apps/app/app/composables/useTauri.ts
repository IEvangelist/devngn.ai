// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Returns true when running inside a Tauri webview.
 * Gate all Tauri-only APIs behind this check so the plain web PWA build works.
 */
export function useTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}
