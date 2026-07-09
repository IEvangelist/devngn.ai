// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { PromptResponse } from "@devngn/wellness-types";

const SETTINGS_KEY = "devngn_notification_settings";

export interface NotificationSettings {
  enabled: boolean;
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string;   // "HH:MM"
  sound: boolean;
  channels: {
    wellness: boolean;
    streak: boolean;
    badges: boolean;
    reminders: boolean;
  };
}

const defaults: NotificationSettings = {
  enabled: true,
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  sound: true,
  channels: {
    wellness: true,
    streak: true,
    badges: true,
    reminders: true,
  },
};

/** Legacy shape used before the working-hours model landed. */
interface LegacyQuietHours {
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

/**
 * Migrates old "quiet hours" settings (a window when notifications were
 * suppressed) into the inverted "working hours" window (when they fire). The
 * awake window is simply the complement of the quiet window, so the old
 * quiet end becomes the working start and vice versa.
 */
function _normalize(stored: Partial<NotificationSettings> & LegacyQuietHours): NotificationSettings {
  const merged = { ...defaults, ...stored } as NotificationSettings & LegacyQuietHours;
  const hasWorking = typeof stored.workingHoursStart === "string";
  if (!hasWorking && typeof stored.quietHoursEnd === "string" && typeof stored.quietHoursStart === "string") {
    merged.workingHoursStart = stored.quietHoursEnd;
    merged.workingHoursEnd = stored.quietHoursStart;
  }
  delete merged.quietHoursStart;
  delete merged.quietHoursEnd;
  return {
    enabled: merged.enabled,
    workingHoursStart: merged.workingHoursStart,
    workingHoursEnd: merged.workingHoursEnd,
    sound: merged.sound,
    channels: { ...defaults.channels, ...merged.channels },
  };
}

export const useNotificationsStore = defineStore("notifications", () => {
  const isTauri = useTauri();
  const settings = ref<NotificationSettings>({ ...defaults });

  /**
   * True when the current time falls inside the user's working-hours window.
   * Nudges (and their backlog) are only welcome inside this window; outside it
   * the app stays quiet and does not stack anything up. A zero-length window
   * (start === end) is treated as "always on" (24h).
   */
  function isWithinWorkingHours(): boolean {
    const now = new Date();
    const [sh = 9, sm = 0] = settings.value.workingHoursStart.split(":").map(Number);
    const [eh = 17, em = 0] = settings.value.workingHoursEnd.split(":").map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return true; // always on
    // Handles overnight windows (e.g. a 20:00-04:00 night shift)
    if (start > end) {
      return cur >= start || cur < end;
    }
    return cur >= start && cur < end;
  }

  /**
   * Whether a brand-new interruption should be surfaced right now. When the
   * feature is on we honour the working-hours window so nothing queues up off
   * the clock; when it is off the raw stream passes through untouched.
   */
  function shouldAcceptInterruption(): boolean {
    if (!settings.value.enabled) return true;
    return isWithinWorkingHours();
  }

  async function init(): Promise<void> {
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        const stored = await store.get<NotificationSettings>(SETTINGS_KEY);
        if (stored) settings.value = _normalize(stored);
      } catch {
        _loadFromLocalStorage();
      }
    } else {
      _loadFromLocalStorage();
    }
  }

  function _loadFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings.value = _normalize(JSON.parse(raw));
    } catch {
      // ignore
    }
  }

  async function save(): Promise<void> {
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        await store.set(SETTINGS_KEY, settings.value);
      } catch {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value));
      }
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value));
    }
  }

  async function requestPermission(): Promise<boolean> {
    if (!import.meta.client) return false;
    if (isTauri) {
      try {
        const { requestPermission } = await import("@tauri-apps/plugin-notification");
        const perm = await requestPermission();
        return perm === "granted";
      } catch {
        return false;
      }
    } else {
      if (!("Notification" in window)) return false;
      const result = await Notification.requestPermission();
      return result === "granted";
    }
  }

  async function fireForPrompt(prompt: PromptResponse): Promise<void> {
    if (!settings.value.enabled) return;
    if (!isWithinWorkingHours()) return;
    if (!settings.value.channels.wellness) return;

    const title = "devngn";
    const body = prompt.activityTitle ?? "Time for a wellness break!";
    // Active wellness prompts surface on the Today page, so clicking the toast
    // takes the user straight to the "Right now" details.
    const route = "/";

    if (isTauri) {
      try {
        // A native Rust command shows the toast so we can wire click-to-open on
        // Windows (the JS notification plugin can't deliver desktop click
        // callbacks). On click it focuses the window and emits the route the
        // notification-activate plugin listens for.
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("show_wellness_notification", { title, body, route });
      } catch (e) {
        console.warn("[notifications] Tauri notification error:", e);
      }
    } else {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { body, icon: "/pwa-192.png" });
      } catch (e) {
        console.warn("[notifications] Web notification error:", e);
      }
    }
  }

  function update(patch: Partial<NotificationSettings>): void {
    settings.value = { ...settings.value, ...patch };
  }

  return {
    settings,
    init,
    save,
    update,
    requestPermission,
    fireForPrompt,
    isWithinWorkingHours,
    shouldAcceptInterruption,
  };
});
