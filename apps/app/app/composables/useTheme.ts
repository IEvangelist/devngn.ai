// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "devngn_theme";

function apply(choice: ThemeChoice): void {
  if (!import.meta.client) {
    return;
  }
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}

/**
 * Shared theme state. Persists the user's explicit choice and reflects it onto
 * `data-theme`; `system` defers to `prefers-color-scheme` (no attribute set).
 */
export function useTheme() {
  const choice = useState<ThemeChoice>("theme", () => "system");

  function set(next: ThemeChoice): void {
    choice.value = next;
    apply(next);
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  function init(): void {
    if (!import.meta.client) {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      choice.value = stored;
    }
    apply(choice.value);
  }

  function toggle(): void {
    // system -> light -> dark -> system
    const order: ThemeChoice[] = ["system", "light", "dark"];
    const idx = order.indexOf(choice.value);
    set(order[(idx + 1) % order.length]!);
  }

  return { choice, set, init, toggle };
}
