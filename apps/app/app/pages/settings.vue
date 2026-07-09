<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section class="page">
    <PageHeader :title="$t('settings.title')" :intro="$t('settings.intro')" />

    <div class="settings-stack">
      <!-- Personal setup -->
      <div class="reveal reveal--1">
        <ProfileSettings />
      </div>

      <!-- Equipment -->
      <div class="reveal reveal--2">
        <EquipmentSettings />
      </div>

      <!-- Appearance -->
      <BrutPanel class="reveal reveal--3">
        <h2 class="section-label">{{ $t("settings.appearance") }}</h2>

        <div class="settings-rows">
          <div class="setting-row">
              <label class="setting-row__label" for="theme-select">{{ $t("settings.theme") }}</label>
              <div class="setting-row__control setting-row__control--select">
                <BrutSelect
                  id="theme-select"
                  :model-value="themeChoice"
                  :options="themeOptions"
                  :aria-label="$t('settings.theme')"
                  @update:model-value="setTheme"
                />
              </div>
            </div>

            <!-- Language -->
            <div class="setting-row">
              <label class="setting-row__label" for="lang-select">{{ $t("settings.language") }}</label>
              <div class="setting-row__control setting-row__control--select">
                <BrutSelect
                  id="lang-select"
                  :model-value="locale"
                  :options="localeOptions"
                  :aria-label="$t('settings.language')"
                  @update:model-value="setLocale"
                />
              </div>
            </div>
        </div>
      </BrutPanel>

      <!-- Notifications -->
      <BrutPanel class="reveal reveal--4">
        <h2 class="section-label">{{ $t("settings.notifications") }}</h2>

        <div class="settings-rows">
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
        </div>
      </BrutPanel>

      <!-- App updates -->
      <BrutPanel class="reveal reveal--5">
        <h2 class="section-label">{{ $t("settings.updates") }}</h2>
        <div class="settings-updates">
          <template v-if="isTauri">
            <p v-if="updateStatus === 'idle'" class="settings-updates__text">{{ $t("settings.upToDate") }}</p>
            <p v-else-if="updateStatus === 'checking'" class="settings-updates__text">{{ $t("common.loading") }}</p>
            <div v-else-if="updateStatus === 'available'" class="update-available">
              <p class="settings-updates__text">{{ $t("settings.updateAvailable") }}</p>
              <BrutButton variant="accent" @click="installUpdate">
                {{ $t("settings.installUpdate") }}
              </BrutButton>
            </div>
            <BrutButton size="sm" @click="checkForUpdates">
              {{ $t("settings.checkForUpdates") }}
            </BrutButton>
          </template>
          <p v-else class="settings-updates__text">{{ $t("settings.pwaAutoUpdate") }}</p>
        </div>
      </BrutPanel>

      <!-- Save -->
      <div class="settings__actions reveal reveal--5">
        <BrutButton variant="accent" @click="save">{{ $t("common.save") }}</BrutButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ThemeChoice } from "~/composables/useTheme";
import type { SelectOption } from "~/components/ui/BrutSelect.vue";

const { choice: themeChoice, set: setTheme } = useTheme();
const { locale, locales, setLocale } = useI18n();

const notifStore = useNotificationsStore();
const { settings } = storeToRefs(notifStore);

const isTauri = useTauri();
const toast = useToast();
const { t } = useI18n();

type LocaleCode = typeof locale.value;

const themeOptions = computed<SelectOption<ThemeChoice>[]>(() => [
  { value: "system", label: t("settings.themeSystem") },
  { value: "light", label: t("settings.themeLight") },
  { value: "dark", label: t("settings.themeDark") },
]);
const localeOptions = computed<SelectOption<LocaleCode>[]>(() =>
  locales.value.map((loc) => ({ value: loc.code as LocaleCode, label: loc.name ?? loc.code })),
);

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
.page {
  max-width: 44rem;
}
.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
/* A little breathing room under each panel heading. */
.settings-rows {
  margin-top: 1rem;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--line);
}
.setting-row:last-child { border-bottom: none; }
.setting-row__label { font-weight: 600; flex: 1; }
.setting-row__control { flex: 0 0 auto; }
.setting-row__control--select { width: 12rem; }
.setting-time { width: 9rem; }
.settings-updates {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.85rem;
}
.settings-updates__text { margin: 0; color: var(--muted); font-size: 0.92rem; }
.update-available { display: flex; align-items: center; gap: 1rem; }
.settings__actions { display: flex; gap: 0.75rem; }
</style>
