<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section class="page">
    <PageHeader :title="$t('goals.pageTitle')" :intro="$t('goals.intro')">
      <template #actions>
        <BrutButton variant="accent" @click="showCreate = true">
          {{ $t("goals.addGoal") }}
        </BrutButton>
      </template>
    </PageHeader>

    <div v-if="goals.length" class="goals__list reveal reveal--1">
      <BrutCard v-for="goal in goals" :key="goal.id" class="goal-card">
        <div class="goal-card__header">
          <BrutChip :color="categoryColor(goal.category)">
            {{ goal.category }}
          </BrutChip>
          <h3 class="goal-card__title">{{ goal.title }}</h3>
        </div>
        <BrutProgress
          :value="0"
          :max="100"
          :label="`${goal.title} progress`"
        />
        <p v-if="goal.description" class="goal-card__desc">{{ goal.description }}</p>
      </BrutCard>
    </div>
    <BrutPanel v-else-if="!loading" class="goals__empty reveal reveal--1">
      <p>{{ $t("goals.empty") }}</p>
    </BrutPanel>
    <BrutPanel v-else class="reveal reveal--1">
      <p>{{ $t("common.loading") }}</p>
    </BrutPanel>

    <!-- Create goal modal -->
    <BrutModal :open="showCreate" :title="$t('goals.addGoal')" @close="showCreate = false">
      <form @submit.prevent="createGoal">
        <div class="form-field">
          <label class="brut-eyebrow" for="goal-title">{{ $t("goals.title") }}</label>
          <input id="goal-title" v-model="newGoal.title" class="brut-input" required />
        </div>
        <div class="form-field">
          <label class="brut-eyebrow" for="goal-desc">{{ $t("goals.description") }}</label>
          <textarea id="goal-desc" v-model="newGoal.description" class="brut-textarea" rows="3" />
        </div>
      </form>
      <template #footer>
        <BrutButton @click="showCreate = false">{{ $t("common.cancel") }}</BrutButton>
        <BrutButton variant="accent" @click="createGoal">{{ $t("common.save") }}</BrutButton>
      </template>
    </BrutModal>
  </section>
</template>

<script setup lang="ts">
import type { GoalResponse, GoalCategory } from "@devngn/wellness-types";

const { isAuthenticated } = storeToRefs(useAuthStore());
const apiFetch = useApiFetch();
const toast = useToast();
const { t } = useI18n();

const goals = ref<GoalResponse[]>([]);
const loading = ref(false);
const showCreate = ref(false);
const newGoal = reactive({ title: "", description: "" });

async function fetchGoals(): Promise<void> {
  if (!isAuthenticated.value) return;
  loading.value = true;
  try {
    const result = await apiFetch<GoalResponse[]>("/v1/goals");
    goals.value = result ?? [];
  } catch (e) {
    toast.error(t("common.loadError"));
  } finally {
    loading.value = false;
  }
}

async function createGoal(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;
    await apiFetch<GoalResponse>("/v1/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newGoal.title,
        description: newGoal.description,
        startDate: today,
      }),
    });
    newGoal.title = "";
    newGoal.description = "";
    showCreate.value = false;
    toast.success(t("goals.created"));
    await fetchGoals();
  } catch {
    toast.error(t("common.saveError"));
  }
}

function categoryColor(cat: GoalCategory | undefined): "teal" | "purple" | "pink" | "blue" {
  const map: Record<string, "teal" | "purple" | "pink" | "blue"> = {
    Mobility: "teal",
    Strength: "purple",
    Breathing: "teal",
    Posture: "pink",
    CardioLight: "blue",
  };
  return map[cat ?? ""] ?? "teal";
}

onMounted(fetchGoals);
watch(isAuthenticated, (v) => { if (v) fetchGoals(); });
</script>

<style scoped>
.goals__list { display: grid; gap: 1rem; }
.goals__empty { text-align: center; color: var(--muted); }
.goal-card__header { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.65rem; }
.goal-card__title { margin: 0; font-size: 1rem; }
.goal-card__desc { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.9rem; }
.form-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
</style>
