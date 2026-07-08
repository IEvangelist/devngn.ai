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
      <BrutButton size="sm" variant="accent" :disabled="!isAuthenticated" @click="openCreate">
        {{ $t("equipment.add") }}
      </BrutButton>
    </div>
    <p class="section-intro">{{ $t("equipment.intro") }}</p>

    <template v-if="!isAuthenticated">
      <p class="section-signin brut-eyebrow">{{ $t("equipment.signInHint") }}</p>
    </template>

    <template v-else>
      <!-- Quick add: gear the catalog knows about that you haven't registered -->
      <div v-if="suggestions.length" class="quick-add">
        <span class="field-label">{{ $t("equipment.quickAdd") }}</span>
        <div class="quick-add__chips">
          <button
            v-for="s in suggestions"
            :key="s.tag"
            type="button"
            class="quick-chip"
            :disabled="equipmentStore.saving"
            @click="quickAdd(s)"
          >
            <span aria-hidden="true">＋</span> {{ s.displayName }}
          </button>
        </div>
      </div>

      <!-- Owned equipment -->
      <ul v-if="equipmentStore.items.length" class="equip-list">
        <li v-for="item in equipmentStore.items" :key="item.id" class="equip-row">
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

      <div v-else-if="equipmentStore.loading" class="form-skeleton" aria-hidden="true">
        <div v-for="n in 2" :key="n" class="skeleton-row" />
      </div>

      <p v-else class="equip-empty">{{ $t("equipment.empty") }}</p>

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
import type { EquipmentResponse, ActivityResponse } from "~/types/wellness";

const { t } = useI18n();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const equipmentStore = useEquipmentStore();
const apiFetch = useApiFetch();

/** Friendly names for the tags the seeded catalog understands. */
const KNOWN_TAG_NAMES: Record<string, string> = {
  "chair-only": "Office chair",
  "bands-light": "Light resistance band",
  mat: "Exercise mat",
};

const catalogTags = ref<string[]>([]);

const suggestions = computed(() => {
  const owned = new Set(equipmentStore.tags);
  return catalogTags.value
    .filter((tag) => !owned.has(tag))
    .map((tag) => ({ tag, displayName: KNOWN_TAG_NAMES[tag] ?? tag }));
});

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

async function quickAdd(s: { tag: string; displayName: string }): Promise<void> {
  const ok = await equipmentStore.create({ tag: s.tag, displayName: s.displayName, notes: null });
  if (ok) {
    toast.success(t("equipment.added", { name: s.displayName }));
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

async function loadCatalogTags(): Promise<void> {
  try {
    const catalog = await apiFetch<ActivityResponse[]>("/v1/activities");
    const tags = new Set<string>();
    for (const a of catalog ?? []) {
      for (const tag of a.equipmentTags) tags.add(tag);
    }
    catalogTags.value = Array.from(tags).sort();
  } catch {
    catalogTags.value = [];
  }
}

async function loadForUser(): Promise<void> {
  await Promise.all([
    catalogTags.value.length ? Promise.resolve() : loadCatalogTags(),
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
.quick-add {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}
.quick-add__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--accent-strong);
  background: var(--accent-tint);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background 0.15s ease;
}
.quick-chip:hover { background: var(--accent-tint-strong); }
.quick-chip:disabled { opacity: 0.5; cursor: default; }
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
.form-skeleton { display: flex; flex-direction: column; gap: 0.7rem; }
.skeleton-row {
  height: 2.5rem;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-row { animation: none; }
}
@media (max-width: 640px) {
  .equip-row { flex-direction: column; align-items: flex-start; }
}
</style>
