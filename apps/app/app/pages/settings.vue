<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("settings.title") }}</h1>

    <!-- Appearance -->
    <BrutPanel class="settings-section">
      <h2 class="settings-section__title">{{ $t("settings.appearance") }}</h2>

      <div class="setting-row">
        <label class="setting-row__label" for="theme-select">{{ $t("settings.theme") }}</label>
        <div class="setting-row__control">
          <select
            id="theme-select"
            class="brut-select"
            :value="themeChoice"
            @change="setTheme(($event.target as HTMLSelectElement).value as ThemeChoice)"
          >
            <option value="system">{{ $t("settings.themeSystem") }}</option>
            <option value="light">{{ $t("settings.themeLight") }}</option>
            <option value="dark">{{ $t("settings.themeDark") }}</option>
          </select>
        </div>
      </div>

      <!-- Language -->
      <div class="setting-row">
        <label class="setting-row__label" for="lang-select">{{ $t("settings.language") }}</label>
        <div class="setting-row__control">
          <select
            id="lang-select"
            class="brut-select"
            :value="locale"
            @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'zh-Hans')"
          >
            <option v-for="loc in locales" :key="loc.code" :value="loc.code">
              {{ loc.name }}
            </option>
          </select>
        </div>
      </div>
    </BrutPanel>

    <!-- Notifications -->
    <BrutPanel class="settings-section">
      <h2 class="settings-section__title">{{ $t("settings.notifications") }}</h2>

      <div class="setting-row">
        <span class="setting-row__label">{{ $t("settings.notificationsEnable") }}</span>
        <div class="setting-row__control">
          <BrutToggle
            :model-value="settings.enabled"
            :label="$t('settings.notificationsEnable')"
            @update:model-value="toggleNotifications"
          />
        </div>
      </div>

      <template v-if="settings.enabled">
        <div class="setting-row">
          <span class="setting-row__label">{{ $t("settings.sound") }}</span>
          <div class="setting-row__control">
            <BrutToggle
              :model-value="settings.sound"
              :label="$t('settings.sound')"
              @update:model-value="updateSetting('sound', $event)"
            />
          </div>
        </div>

        <div class="setting-row">
          <label class="setting-row__label" for="qh-start">{{ $t("settings.quietHoursFrom") }}</label>
          <input
            id="qh-start"
            type="time"
            class="brut-input setting-time"
            :value="settings.quietHoursStart"
            @change="updateSetting('quietHoursStart', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="setting-row">
          <label class="setting-row__label" for="qh-end">{{ $t("settings.quietHoursTo") }}</label>
          <input
            id="qh-end"
            type="time"
            class="brut-input setting-time"
            :value="settings.quietHoursEnd"
            @change="updateSetting('quietHoursEnd', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </template>
    </BrutPanel>

    <!-- App updates -->
    <BrutPanel class="settings-section">
      <h2 class="settings-section__title">{{ $t("settings.updates") }}</h2>
      <template v-if="isTauri">
        <p v-if="updateStatus === 'idle'">{{ $t("settings.upToDate") }}</p>
        <p v-else-if="updateStatus === 'checking'">{{ $t("common.loading") }}</p>
        <div v-else-if="updateStatus === 'available'" class="update-available">
          <p>{{ $t("settings.updateAvailable") }}</p>
          <BrutButton variant="accent" @click="installUpdate">
            {{ $t("settings.installUpdate") }}
          </BrutButton>
        </div>
        <BrutButton size="sm" @click="checkForUpdates">
          {{ $t("settings.checkForUpdates") }}
        </BrutButton>
      </template>
      <p v-else class="brut-eyebrow">{{ $t("settings.pwaAutoUpdate") }}</p>
    </BrutPanel>

    <!-- Save -->
    <div class="settings__actions">
      <BrutButton variant="accent" @click="save">{{ $t("common.save") }}</BrutButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ThemeChoice } from "~/composables/useTheme";

const { choice: themeChoice, set: setTheme } = useTheme();
const { locale, locales, setLocale } = useI18n();

const notifStore = useNotificationsStore();
const { settings } = storeToRefs(notifStore);

const isTauri = useTauri();
const toast = useToast();
const { t } = useI18n();

type UpdateStatus = "idle" | "checking" | "available" | "installing";
const updateStatus = ref<UpdateStatus>("idle");

async function toggleNotifications(val: boolean): Promise<void> {
  if (val) {
    const granted = await notifStore.requestPermission();
    if (!granted) {
      toast.warning(t("settings.notificationsDenied"));
      return;
    }
  }
  notifStore.update({ enabled: val });
}

function updateSetting<K extends keyof typeof settings.value>(
  key: K,
  value: (typeof settings.value)[K],
): void {
  notifStore.update({ [key]: value });
}

async function save(): Promise<void> {
  await notifStore.save();
  toast.success(t("common.saved"));
}

async function checkForUpdates(): Promise<void> {
  if (!isTauri) return;
  updateStatus.value = "checking";
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    updateStatus.value = update ? "available" : "idle";
  } catch (e) {
    console.error("[updater]", e);
    updateStatus.value = "idle";
    toast.error(t("settings.updateError"));
  }
}

async function installUpdate(): Promise<void> {
  if (!isTauri) return;
  updateStatus.value = "installing";
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch (e) {
    console.error("[updater] install failed:", e);
    toast.error(t("settings.updateError"));
    updateStatus.value = "available";
  }
}
</script>

<style scoped>
.settings-section {
  margin-bottom: 1.5rem;
}
.settings-section__title {
  font-size: 1rem;
  margin: 0 0 1rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 15%, transparent);
}
.setting-row:last-child { border-bottom: none; }
.setting-row__label { font-weight: 700; flex: 1; }
.setting-row__control { flex: 0 0 auto; }
.setting-time { width: 9rem; }
.update-available { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
.settings__actions { display: flex; gap: 0.75rem; }
</style>
