// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { PromptResponse } from "@devngn/wellness-types";

const SETTINGS_KEY = "devngn_notification_settings";

export interface NotificationSettings {
  enabled: boolean;
  quietHoursStart: string; // "HH:MM"
  quietHoursEnd: string;   // "HH:MM"
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
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  sound: true,
  channels: {
    wellness: true,
    streak: true,
    badges: true,
    reminders: true,
  },
};

export const useNotificationsStore = defineStore("notifications", () => {
  const isTauri = useTauri();
  const settings = ref<NotificationSettings>({ ...defaults });

  function _isQuietHour(): boolean {
    const now = new Date();
    const [sh = 22, sm = 0] = settings.value.quietHoursStart.split(":").map(Number);
    const [eh = 7, em = 0] = settings.value.quietHoursEnd.split(":").map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    // Handles overnight ranges (e.g. 22:00–07:00)
    if (start > end) {
      return cur >= start || cur < end;
    }
    return cur >= start && cur < end;
  }

  async function init(): Promise<void> {
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        const stored = await store.get<NotificationSettings>(SETTINGS_KEY);
        if (stored) settings.value = { ...defaults, ...stored };
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
      if (raw) settings.value = { ...defaults, ...JSON.parse(raw) };
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
    if (_isQuietHour()) return;
    if (!settings.value.channels.wellness) return;

    const title = "devngn";
    const body = prompt.activityTitle ?? "Time for a wellness break!";

    if (isTauri) {
      try {
        const { sendNotification, isPermissionGranted, requestPermission } =
          await import("@tauri-apps/plugin-notification");
        let ok = await isPermissionGranted();
        if (!ok) {
          const result = await requestPermission();
          ok = result === "granted";
        }
        if (ok) {
          sendNotification({ title, body });
        }
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

  return { settings, init, save, update, requestPermission, fireForPrompt };
});
