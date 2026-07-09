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
      <div
        v-for="goal in goals"
        :key="goal.id"
        class="goal-item"
        :class="{ 'is-flipped': flipped.has(goal.id), 'is-leaving': leaving.has(goal.id) }"
        :style="{ '--cat': `var(${categoryVar(goal.category)})` }"
      >
        <div class="goal-flip">
          <BrutCard class="goal-flip__face goal-flip__front">
            <div class="goal-card__top">
              <BrutChip :color="categoryColor(goal.category)">
                {{ goal.category }}
              </BrutChip>
            </div>
            <h3 class="goal-card__title">{{ goal.title }}</h3>
            <p v-if="goal.description" class="goal-card__desc">{{ goal.description }}</p>
            <div class="goal-card__meta">
              <div v-if="goal.targetMetric" class="goal-meta">
                <span class="goal-meta__label">{{ $t("goals.target") }}</span>
                <span class="goal-meta__value">{{ goal.targetMetric }}</span>
              </div>
              <div class="goal-meta">
                <span class="goal-meta__label">{{ $t("goals.started") }}</span>
                <span class="goal-meta__value">{{ formatDate(goal.startDate) }}</span>
              </div>
              <div v-if="goal.endDate" class="goal-meta">
                <span class="goal-meta__label">{{ $t("goals.due") }}</span>
                <span class="goal-meta__value">{{ formatDate(goal.endDate) }}</span>
              </div>
            </div>
            <div class="goal-card__actions">
              <BrutButton
                variant="accent"
                size="sm"
                :disabled="completing.has(goal.id)"
                :aria-label="$t('goals.markDoneA11y', { title: goal.title })"
                @click="completeGoal(goal)"
              >
                <span class="goal-done-btn">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <path
                      d="M20 6 9 17l-5-5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  {{ $t("goals.markDone") }}
                </span>
              </BrutButton>
            </div>
          </BrutCard>

          <BrutCard class="goal-flip__face goal-flip__back" aria-hidden="true">
            <span class="goal-done">
              <span class="goal-done__mark">
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                  <path
                    d="M20 6 9 17l-5-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span class="goal-done__label">{{ $t("goals.completed") }}</span>
              <span class="goal-done__title">{{ goal.title }}</span>
            </span>
          </BrutCard>
        </div>
      </div>
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

// Goal ids that are mid-completion: flipped shows the done face, leaving fades
// the card out after the server delete, completing guards against double taps.
const flipped = reactive(new Set<string>());
const leaving = reactive(new Set<string>());
const completing = reactive(new Set<string>());

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

// The design-token accent used for each category's left edge stripe.
function categoryVar(cat: GoalCategory | undefined): string {
  const map: Record<string, string> = {
    Mobility: "--accent-2",
    Strength: "--accent-4",
    Breathing: "--accent-2",
    Posture: "--accent-5",
    CardioLight: "--accent-6",
  };
  return map[cat ?? ""] ?? "--accent-2";
}

// Complete a goal: flip the card to the done face, delete it on the server,
// then fade the card out. Goals have no completed state, so completing one
// clears it from the active list. Reverts the flip if the delete fails.
async function completeGoal(goal: GoalResponse): Promise<void> {
  if (completing.has(goal.id)) return;
  completing.add(goal.id);
  flipped.add(goal.id);

  const reduce = prefersReducedMotion();
  const minShow = reduce ? 420 : 1120;
  const start = performance.now();

  try {
    await apiFetch(`/v1/goals/${goal.id}`, { method: "DELETE" });
    const elapsed = performance.now() - start;
    if (elapsed < minShow) await delay(minShow - elapsed);
    leaving.add(goal.id);
    await delay(reduce ? 0 : 300);
    goals.value = goals.value.filter((g) => g.id !== goal.id);
    toast.success(t("goals.completedToast"));
  } catch {
    flipped.delete(goal.id);
    toast.error(t("goals.completeError"));
  } finally {
    completing.delete(goal.id);
    leaving.delete(goal.id);
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

onMounted(fetchGoals);
watch(isAuthenticated, (v) => { if (v) fetchGoals(); });
</script>

<style scoped>
.goals__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(15rem, 30%, 21rem), 1fr));
  gap: 1rem;
  align-items: start;
}
.goals__empty { text-align: center; color: var(--muted); }

/* ---- Flip card mechanics --------------------------------------------------
 * The item is the perspective container; .goal-flip is the 3D-preserving
 * wrapper that rotates. A positive rotateY swings the right edge toward the
 * viewer and the left edge away, landing on the pre-rotated done face.
 * The global reduced-motion rule zeroes the transition, so it snaps.
 */
.goal-item {
  perspective: 1400px;
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.goal-item.is-leaving {
  opacity: 0;
  transform: scale(0.96);
}
.goal-flip {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.62s cubic-bezier(0.16, 1, 0.3, 1);
}
.goal-item.is-flipped .goal-flip {
  transform: rotateY(180deg);
}
.goal-flip__face {
  width: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.goal-flip__front {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.goal-flip__front::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: var(--cat, var(--accent-2));
}
.goal-flip__back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  display: grid;
  place-items: center;
  border-color: color-mix(in srgb, var(--success) 45%, var(--line));
}

/* ---- Front face content --------------------------------------------------- */
.goal-card__top { margin-bottom: 0.7rem; }
.goal-card__title { margin: 0; font-size: 1rem; line-height: 1.3; }
.goal-card__desc { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
.goal-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.5rem;
  margin-top: 0.9rem;
  padding-top: 0.75rem;
  border-top: var(--border);
}
.goal-meta { display: flex; flex-direction: column; gap: 0.15rem; }
.goal-meta__label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--muted);
}
.goal-meta__value { font-size: 0.85rem; color: var(--ink); }
.goal-card__actions {
  margin-top: auto;
  padding-top: 0.95rem;
  display: flex;
  justify-content: flex-end;
}
.goal-done-btn { display: inline-flex; align-items: center; gap: 0.4rem; }

/* ---- Back (done) face ----------------------------------------------------- */
.goal-done { display: grid; justify-items: center; gap: 0.55rem; padding: 0.5rem; text-align: center; }
.goal-done__mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.goal-done__label {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--success);
}
.goal-done__title { font-size: 0.85rem; color: var(--muted); max-width: 22ch; }

@media (prefers-reduced-motion: no-preference) {
  .goal-item.is-flipped .goal-done__mark {
    animation: goal-pop 0.5s 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
@keyframes goal-pop {
  from { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.08); }
  to { transform: scale(1); opacity: 1; }
}

.form-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
</style>
