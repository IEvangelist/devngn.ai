<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Equipment management: the gear you have on hand. Registering equipment unlocks
  activities that need it, so the engine can suggest more than bodyweight moves.
-->
<template>
  <BrutPanel class="settings-section">
    <div class="section-head">
      <h2 class="section-label">{{ $t("equipment.title") }}</h2>
      <BrutButton size="sm" variant="ghost" :disabled="!isAuthenticated" @click="openCreate">
        <AppIcon name="plus" /> {{ $t("equipment.addCustom") }}
      </BrutButton>
    </div>
    <p class="section-intro">{{ $t("equipment.intro") }}</p>

    <template v-if="!isAuthenticated">
      <p class="section-signin brut-eyebrow">{{ $t("equipment.signInHint") }}</p>
    </template>

    <template v-else>
      <div v-if="equipmentStore.loading && !catalogGroups.length" class="tile-skeleton" aria-hidden="true">
        <div v-for="n in 6" :key="n" class="skeleton-tile" />
      </div>

      <!-- Curated, categorised gear picker. Tap a tile to add or remove. -->
      <div v-for="group in catalogGroups" :key="group.category" class="equip-group">
        <h3 class="equip-group__label">
          <AppIcon :name="categoryIcon(group.category)" />
          {{ categoryLabel(group.category) }}
        </h3>
        <div class="equip-grid">
          <button
            v-for="entry in group.entries"
            :key="entry.tag"
            type="button"
            class="equip-tile"
            :class="{ 'equip-tile--owned': isOwned(entry.tag) }"
            :aria-pressed="isOwned(entry.tag)"
            :aria-label="isOwned(entry.tag)
              ? $t('equipment.removeA11y', { name: entry.displayName })
              : $t('equipment.addA11y', { name: entry.displayName })"
            :disabled="equipmentStore.saving"
            @click="toggleCatalog(entry)"
          >
            <span class="equip-tile__mark" aria-hidden="true">
              <AppIcon :name="equipmentIcon(entry.tag)" />
            </span>
            <span class="equip-tile__name">{{ entry.displayName }}</span>
            <span v-if="policyHint(entry)" class="equip-tile__hint">{{ policyHint(entry) }}</span>
            <span v-if="isOwned(entry.tag)" class="equip-tile__check" aria-hidden="true">
              <AppIcon name="check-circle" />
            </span>
          </button>
        </div>
      </div>

      <!-- Gear you registered by hand that isn't in the curated catalog -->
      <div v-if="customItems.length" class="equip-group">
        <h3 class="equip-group__label">
          <AppIcon name="barbell" />
          {{ $t("equipment.customTitle") }}
        </h3>
        <ul class="equip-list">
          <li v-for="item in customItems" :key="item.id" class="equip-row">
            <div class="equip-row__main">
              <span class="equip-row__name">{{ item.displayName }}</span>
              <BrutBadge color="teal">{{ item.tag }}</BrutBadge>
              <span v-if="item.notes" class="equip-row__notes">{{ item.notes }}</span>
            </div>
            <div class="equip-row__actions">
              <BrutButton size="sm" variant="ghost" @click="openEdit(item)">
                {{ $t("common.edit") }}
              </BrutButton>
              <BrutButton size="sm" variant="ghost" @click="askRemove(item)">
                {{ $t("common.remove") }}
              </BrutButton>
            </div>
          </li>
        </ul>
      </div>

      <p
        v-if="!equipmentStore.loading && !catalogGroups.length && !customItems.length"
        class="equip-empty"
      >
        {{ $t("equipment.empty") }}
      </p>

      <p v-if="equipmentStore.error" class="form-error" role="alert">{{ equipmentStore.error }}</p>
    </template>

    <!-- Create / edit modal -->
    <BrutModal :open="showForm" :title="editing ? $t('equipment.editTitle') : $t('equipment.addTitle')" @close="closeForm">
      <form @submit.prevent="submitForm">
        <div class="form-field">
          <label class="field-label" for="eq-tag">{{ $t("equipment.tag") }}</label>
          <input
            id="eq-tag"
            v-model="draft.tag"
            class="brut-input"
            :disabled="!!editing"
            :placeholder="$t('equipment.tagPlaceholder')"
            required
          />
          <span class="field-help">{{ editing ? $t("equipment.tagLocked") : $t("equipment.tagHelp") }}</span>
        </div>
        <div class="form-field">
          <label class="field-label" for="eq-name">{{ $t("equipment.displayName") }}</label>
          <input id="eq-name" v-model="draft.displayName" class="brut-input" required />
        </div>
        <div class="form-field">
          <label class="field-label" for="eq-notes">{{ $t("equipment.notes") }}</label>
          <input id="eq-notes" v-model="draft.notes" class="brut-input" :placeholder="$t('profile.optional')" />
        </div>
      </form>
      <template #footer>
        <BrutButton @click="closeForm">{{ $t("common.cancel") }}</BrutButton>
        <BrutButton variant="accent" :loading="equipmentStore.saving" @click="submitForm">
          {{ $t("common.save") }}
        </BrutButton>
      </template>
    </BrutModal>

    <!-- Remove confirmation -->
    <BrutConfirm
      v-model:open="confirmOpen"
      danger
      :title="$t('equipment.removeTitle')"
      :description="pendingRemove ? $t('equipment.removeBody', { name: pendingRemove.displayName }) : ''"
      :confirm-label="$t('common.remove')"
      @confirm="doRemove"
      @cancel="pendingRemove = null"
    />
  </BrutPanel>
</template>

<script setup lang="ts">
import type {
  EquipmentResponse,
  EquipmentCatalogEntryResponse,
  EquipmentCategory,
} from "~/types/wellness";

const { t } = useI18n();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const equipmentStore = useEquipmentStore();
const { equipmentIcon, categoryIcon } = useEquipmentIcons();

/** Stable category order for the picker sections. */
const CATEGORY_ORDER: EquipmentCategory[] = ["Cardio", "Strength", "Mobility", "Desk"];

const catalogTagSet = computed(() => new Set(equipmentStore.catalog.map((c) => c.tag)));
const ownedTagSet = computed(() => new Set(equipmentStore.tags));

/** Catalog entries grouped by category, in a fixed display order. */
const catalogGroups = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    entries: equipmentStore.catalog.filter((c) => c.category === category),
  })).filter((g) => g.entries.length > 0),
);

/** Registered gear that isn't part of the curated catalog. */
const customItems = computed(() =>
  equipmentStore.items.filter((i) => !catalogTagSet.value.has(i.tag)),
);

function isOwned(tag: string): boolean {
  return ownedTagSet.value.has(tag);
}

function categoryLabel(category: EquipmentCategory): string {
  return t(`equipment.category${category}`);
}

/** A short cadence hint for gear that carries a recommended usage policy. */
function policyHint(entry: EquipmentCatalogEntryResponse): string | null {
  const sessions = Number(entry.recommendedWeeklySessions) || 0;
  const minutes = Number(entry.minSessionMinutes) || 0;
  if (sessions && minutes) return t("equipment.policyFull", { sessions, minutes });
  if (sessions) return t("equipment.policySessions", { sessions });
  if (minutes) return t("equipment.policyMinutes", { minutes });
  return null;
}

async function toggleCatalog(entry: EquipmentCatalogEntryResponse): Promise<void> {
  const owned = equipmentStore.ownedByTag(entry.tag);
  if (owned) {
    askRemove(owned);
    return;
  }
  const ok = await equipmentStore.create({
    tag: entry.tag,
    displayName: entry.displayName,
    notes: null,
  });
  if (ok) {
    toast.success(t("equipment.added", { name: entry.displayName }));
  } else {
    toast.error(t("common.saveError"));
  }
}

const showForm = ref(false);
const editing = ref<EquipmentResponse | null>(null);
const draft = reactive({ tag: "", displayName: "", notes: "" });

function openCreate(): void {
  editing.value = null;
  draft.tag = "";
  draft.displayName = "";
  draft.notes = "";
  showForm.value = true;
}

function openEdit(item: EquipmentResponse): void {
  editing.value = item;
  draft.tag = item.tag;
  draft.displayName = item.displayName;
  draft.notes = item.notes ?? "";
  showForm.value = true;
}

function closeForm(): void {
  showForm.value = false;
}

async function submitForm(): Promise<void> {
  const notes = draft.notes.trim() || null;
  let ok: boolean;
  if (editing.value) {
    ok = await equipmentStore.update(editing.value.id, { displayName: draft.displayName, notes });
  } else {
    ok = await equipmentStore.create({ tag: draft.tag.trim(), displayName: draft.displayName, notes });
  }
  if (ok) {
    showForm.value = false;
    toast.success(t("common.saved"));
  } else {
    toast.error(t("common.saveError"));
  }
}

const confirmOpen = ref(false);
const pendingRemove = ref<EquipmentResponse | null>(null);

function askRemove(item: EquipmentResponse): void {
  pendingRemove.value = item;
  confirmOpen.value = true;
}

async function doRemove(): Promise<void> {
  const item = pendingRemove.value;
  confirmOpen.value = false;
  if (!item) return;
  pendingRemove.value = null;
  const ok = await equipmentStore.remove(item.id);
  if (ok) {
    toast.success(t("equipment.removed", { name: item.displayName }));
  } else {
    toast.error(t("common.saveError"));
  }
}

async function loadForUser(): Promise<void> {
  await Promise.all([
    equipmentStore.catalogLoaded ? Promise.resolve() : equipmentStore.fetchCatalog(),
    equipmentStore.loaded ? Promise.resolve() : equipmentStore.fetch(),
  ]);
}

onMounted(() => {
  if (isAuthenticated.value) loadForUser();
});
watch(isAuthenticated, (v) => {
  if (v) loadForUser();
});
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.section-intro {
  margin: 0 0 1.1rem;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.section-signin { color: var(--muted); }
.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink);
}
.field-help { font-size: 0.78rem; color: var(--muted); }

.equip-group { margin-top: 1.4rem; }
.equip-group:first-of-type { margin-top: 0.4rem; }
.equip-group__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink);
}
.equip-group__label :deep(svg) { color: var(--accent-strong); font-size: 1.05rem; }

.equip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 0.7rem;
}
.equip-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.85rem 0.85rem 0.9rem;
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}
.equip-tile:hover { border-color: var(--accent-line); }
.equip-tile:active { transform: translateY(1px); }
.equip-tile:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.equip-tile:disabled { opacity: 0.6; cursor: default; }
.equip-tile--owned {
  border-color: var(--accent-strong);
  background: var(--accent-tint);
}
.equip-tile__mark {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 1.25rem;
}
.equip-tile--owned .equip-tile__mark {
  color: var(--accent-strong);
  border-color: var(--accent-line);
}
.equip-tile__name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.25;
}
.equip-tile__hint {
  font-size: 0.74rem;
  color: var(--muted);
}
.equip-tile--owned .equip-tile__hint { color: var(--accent-strong); }
.equip-tile__check {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  color: var(--accent-strong);
  font-size: 1.05rem;
  line-height: 0;
}

.equip-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.equip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--line);
}
.equip-row:last-child { border-bottom: none; }
.equip-row__main {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  min-width: 0;
}
.equip-row__name { font-weight: 600; }
.equip-row__notes { color: var(--muted); font-size: 0.85rem; }
.equip-row__actions { flex: 0 0 auto; display: flex; gap: 0.35rem; }
.equip-empty { color: var(--muted); font-size: 0.9rem; margin: 0.25rem 0; }
.form-error { margin: 0.5rem 0 0; color: var(--danger); font-size: 0.85rem; }

.tile-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 0.7rem;
}
.skeleton-tile {
  height: 6rem;
  border-radius: var(--radius);
  background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-tile { animation: none; }
}
@media (max-width: 640px) {
  .equip-row { flex-direction: column; align-items: flex-start; }
}
</style>
