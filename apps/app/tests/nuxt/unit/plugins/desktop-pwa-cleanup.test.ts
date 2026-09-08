// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { clearDesktopPwaState } from "~/plugins/desktop-pwa-cleanup.client";

describe("desktop PWA cleanup", () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(
    navigator,
    "serviceWorker",
  );

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"];

    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["serviceWorker"];
    }
  });

  it("leaves web PWA state intact", async () => {
    const getRegistrations = vi.fn();
    const keys = vi.fn();

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations },
    });
    vi.stubGlobal("caches", { keys });

    await clearDesktopPwaState();

    expect(getRegistrations).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
  });

  it("removes stale service workers and caches in Tauri", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    const deleteCache = vi.fn().mockResolvedValue(true);
    const keys = vi.fn().mockResolvedValue(["old-shell", "old-assets"]);

    vi.stubGlobal("__TAURI_INTERNALS__", {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations },
    });
    vi.stubGlobal("caches", { keys, delete: deleteCache });

    await clearDesktopPwaState();

    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("old-shell");
    expect(deleteCache).toHaveBeenCalledWith("old-assets");
  });
});
