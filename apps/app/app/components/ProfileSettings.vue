<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Personal setup: teaches the interruption engine who you are so every nudge
  fits your intensity, activity level, and physical limitations.
-->
<template>
  <BrutPanel class="settings-section">
    <div class="section-head">
      <h2 class="section-label">{{ $t("profile.title") }}</h2>
      <BrutBadge v-if="profileStore.hasProfile" color="success" icon="✓">
        {{ $t("profile.saved") }}
      </BrutBadge>
    </div>
    <p class="section-intro">{{ $t("profile.intro") }}</p>

    <template v-if="!isAuthenticated">
      <p class="section-signin brut-eyebrow">{{ $t("profile.signInHint") }}</p>
    </template>

    <template v-else-if="profileStore.loading && !profileStore.loaded">
      <div class="form-skeleton" aria-hidden="true">
        <div v-for="n in 5" :key="n" class="skeleton-row" />
      </div>
    </template>

    <form v-else class="profile-form" @submit.prevent="onSave">
      <div class="field-grid">
        <div class="form-field">
          <label class="field-label" for="pf-baseline">{{ $t("profile.fitnessBaseline") }}</label>
          <BrutSelect
            id="pf-baseline"
            v-model="form.fitnessBaseline"
            :options="baselineOptions"
            :aria-label="$t('profile.fitnessBaseline')"
          />
        </div>

        <div class="form-field">
          <label class="field-label" for="pf-intensity">{{ $t("profile.preferredIntensity") }}</label>
          <BrutSelect
            id="pf-intensity"
            v-model="form.preferredIntensity"
            :options="intensityOptions"
            :aria-label="$t('profile.preferredIntensity')"
          />
        </div>

        <div class="form-field">
          <label class="field-label" for="pf-age">{{ $t("profile.ageRange") }}</label>
          <BrutSelect
            id="pf-age"
            v-model="ageRangeModel"
            :options="ageOptions"
            :aria-label="$t('profile.ageRange')"
          />
        </div>

        <div class="form-field">
          <label class="field-label" for="pf-time">{{ $t("profile.timeOfDay") }}</label>
          <BrutSelect
            id="pf-time"
            v-model="timeOfDayModel"
            :options="timeOptions"
            :aria-label="$t('profile.timeOfDay')"
          />
        </div>

        <div class="form-field">
          <label class="field-label" for="pf-height">{{ $t("profile.heightCm") }}</label>
          <input
            id="pf-height"
            v-model="heightModel"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            class="brut-input"
            :placeholder="$t('profile.optional')"
          />
        </div>

        <div class="form-field">
          <label class="field-label" for="pf-weight">{{ $t("profile.weightKg") }}</label>
          <input
            id="pf-weight"
            v-model="weightModel"
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            class="brut-input"
            :placeholder="$t('profile.optional')"
          />
        </div>
      </div>

      <div class="form-field">
        <label class="field-label" for="pf-limits">{{ $t("profile.limitations") }}</label>
        <textarea
          id="pf-limits"
          v-model="limitationsModel"
          class="brut-textarea"
          rows="2"
          :placeholder="$t('profile.limitationsPlaceholder')"
        />
        <span class="field-help">{{ $t("profile.limitationsHelp") }}</span>
      </div>

      <p v-if="profileStore.error" class="form-error" role="alert">{{ profileStore.error }}</p>

      <div class="form-actions">
        <BrutButton type="submit" variant="accent" :loading="profileStore.saving">
          {{ $t("profile.save") }}
        </BrutButton>
      </div>
    </form>
  </BrutPanel>
</template>

<script setup lang="ts">
import type { FitnessBaseline, IntensityLevel } from "~/types/wellness";
import type { SelectOption } from "~/components/ui/BrutSelect.vue";

const { t } = useI18n();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const profileStore = useProfileStore();

const baselines: FitnessBaseline[] = ["Unspecified", "Sedentary", "Light", "Moderate", "Active"];
const intensities: IntensityLevel[] = ["Low", "Medium", "High"];
const ageRanges = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const timePreferences = ["Morning", "Afternoon", "Evening", "Anytime"];

// reka-ui Select forbids empty-string item values, so "not set" uses a sentinel.
const NONE = "none";

const baselineOptions = computed<SelectOption<FitnessBaseline>[]>(() =>
  baselines.map((b) => ({ value: b, label: t(`profile.baseline.${b}`) })),
);
const intensityOptions = computed<SelectOption<IntensityLevel>[]>(() =>
  intensities.map((i) => ({ value: i, label: t(`profile.intensity.${i}`) })),
);
const ageOptions = computed<SelectOption[]>(() => [
  { value: NONE, label: t("profile.notSet") },
  ...ageRanges.map((a) => ({ value: a, label: a })),
]);
const timeOptions = computed<SelectOption[]>(() => [
  { value: NONE, label: t("profile.notSet") },
  ...timePreferences.map((tp) => ({ value: tp, label: t(`profile.time.${tp}`) })),
]);

const form = reactive({
  fitnessBaseline: "Unspecified" as FitnessBaseline,
  preferredIntensity: "Medium" as IntensityLevel,
  ageRange: null as string | null,
  timeOfDayPreference: null as string | null,
  heightCm: null as number | null,
  weightKg: null as number | null,
  limitations: null as string | null,
});

// v-model bridges: the "none" sentinel in the UI maps to null on the wire.
const ageRangeModel = computed({
  get: () => form.ageRange ?? NONE,
  set: (v: string) => (form.ageRange = v === NONE ? null : v),
});
const timeOfDayModel = computed({
  get: () => form.timeOfDayPreference ?? NONE,
  set: (v: string) => (form.timeOfDayPreference = v === NONE ? null : v),
});
const heightModel = computed({
  get: () => (form.heightCm == null ? "" : String(form.heightCm)),
  set: (v: string) => (form.heightCm = v === "" ? null : Number(v)),
});
const weightModel = computed({
  get: () => (form.weightKg == null ? "" : String(form.weightKg)),
  set: (v: string) => (form.weightKg = v === "" ? null : Number(v)),
});
const limitationsModel = computed({
  get: () => form.limitations ?? "",
  set: (v: string) => (form.limitations = v.trim() === "" ? null : v),
});

function hydrate(): void {
  const p = profileStore.profile;
  if (!p) return;
  form.fitnessBaseline = p.fitnessBaseline;
  form.preferredIntensity = p.preferredIntensity;
  form.ageRange = p.ageRange ?? null;
  form.timeOfDayPreference = p.timeOfDayPreference ?? null;
  form.heightCm = p.heightCm == null ? null : Number(p.heightCm);
  form.weightKg = p.weightKg == null ? null : Number(p.weightKg);
  form.limitations = p.limitations ?? null;
}

async function onSave(): Promise<void> {
  const ok = await profileStore.save({ ...form });
  if (ok) {
    toast.success(t("profile.savedToast"));
  } else {
    toast.error(t("common.saveError"));
  }
}

onMounted(async () => {
  if (!isAuthenticated.value) return;
  if (!profileStore.loaded) await profileStore.fetch();
  hydrate();
});
watch(
  () => profileStore.profile,
  () => hydrate(),
);
watch(isAuthenticated, async (v) => {
  if (v && !profileStore.loaded) {
    await profileStore.fetch();
    hydrate();
  }
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
.section-signin {
  color: var(--muted);
}
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem 1rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink);
}
.field-help {
  font-size: 0.78rem;
  color: var(--muted);
}
.form-error {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
}
.form-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
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
  .field-grid { grid-template-columns: 1fr; }
}
</style>
