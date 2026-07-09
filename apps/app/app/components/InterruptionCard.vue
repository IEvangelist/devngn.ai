<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Reusable interruption card used on Today and Interruptions pages.
-->
<template>
  <div class="ix-item" :class="{ 'is-flipped': flipped }">
    <div class="ix-flip">
      <article
        class="interruption-card brut-card ix-flip__face ix-flip__front"
        :aria-label="prompt.activityTitle"
      >
        <header class="interruption-card__header">
          <BrutChip :color="statusColor">{{ derivedStatus }}</BrutChip>
          <BrutChip color="teal">{{ prompt.bodyArea }}</BrutChip>
          <span class="interruption-card__time brut-eyebrow">
            {{ formatTime(prompt.deliveredAt) }}
          </span>
        </header>

        <h3 class="interruption-card__title">{{ prompt.activityTitle }}</h3>

        <div class="interruption-card__meta">
          <span class="ix-meta-chip" :class="`ix-meta-chip--${intensityKey}`">
            {{ intensityLabel }}
          </span>
          <span class="ix-meta-chip ix-meta-chip--time">
            <AppIcon name="timer" /> {{ durationLabel }}
          </span>
          <span v-if="gearName" class="ix-meta-chip ix-meta-chip--gear">
            <AppIcon :name="gearIcon" /> {{ $t("interruptions.usesGear", { name: gearName }) }}
          </span>
        </div>

        <p class="interruption-card__body">{{ prompt.activityDescription }}</p>

        <!-- Step-by-step guidance for the more involved activities. Simple
             one-liners carry no steps and stay a single sentence above. -->
        <ol v-if="hasSteps" class="ix-steps">
          <li v-for="(step, i) in prompt.steps" :key="i" class="ix-step">
            <span class="ix-step__num">{{ i + 1 }}</span>
            <span class="ix-step__body">
              <span class="ix-step__text">{{ step.text }}</span>
              <span v-if="stepMetrics(step).length" class="ix-step__metrics">
                <span v-for="m in stepMetrics(step)" :key="m" class="ix-step__metric">{{ m }}</span>
              </span>
            </span>
          </li>
        </ol>

        <!-- Actions: only for pending prompts (not yet dismissed or completed) -->
        <footer v-if="isActionable" class="interruption-card__actions">
          <BrutButton
            size="sm"
            variant="accent"
            :loading="acting === 'complete'"
            :disabled="completing"
            :aria-label="$t('interruptions.completeA11y', { title: prompt.activityTitle })"
            @click="doComplete"
          >
            {{ $t("interruptions.completeCta") }}
          </BrutButton>
          <BrutButton size="sm" :loading="acting === 'snooze'" :disabled="completing" @click="doSnooze">
            {{ $t("interruptions.snoozeCta") }}
          </BrutButton>
          <BrutButton size="sm" variant="ghost" :loading="acting === 'dismiss'" :disabled="completing" @click="doDismiss">
            {{ $t("interruptions.dismissCta") }}
          </BrutButton>

          <!-- Inline feedback (history view only; the glance view flips instead) -->
          <div v-if="showFeedback" class="interruption-card__feedback" role="group" :aria-label="$t('interruptions.feedback')">
            <span class="brut-eyebrow">{{ $t("interruptions.feedback") }}</span>
            <button
              v-for="r in [1, 2, 3, 4, 5]"
              :key="r"
              type="button"
              class="feedback-star"
              :class="{ 'feedback-star--sel': r <= feedbackRating }"
              :aria-label="`Rate ${r} stars`"
              :aria-pressed="r <= feedbackRating"
              @click="rateAndSubmit(r)"
            >
              ★
            </button>
          </div>
        </footer>
      </article>

      <!-- Completed face: only the glance (Today) view flips to it on done -->
      <div v-if="!showHistory" class="brut-card ix-flip__face ix-flip__back" aria-hidden="true">
        <span class="ix-done">
          <span class="ix-done__mark">
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
          <span class="ix-done__label">{{ $t("interruptions.completed") }}</span>
          <span class="ix-done__title">{{ prompt.activityTitle }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PromptResponse, ActivityStep } from "@devngn/wellness-types";

const props = defineProps<{
  prompt: PromptResponse;
  showHistory?: boolean;
}>();

const interruptions = useInterruptionsStore();
const equipment = useEquipmentStore();
const { equipmentIcon } = useEquipmentIcons();
const toast = useToast();
const { t } = useI18n();
const acting = ref<"complete" | "snooze" | "dismiss" | null>(null);
const showFeedback = ref(false);
const feedbackRating = ref(0);

// Glance-view (Today) completion: flip the card to the done face before the
// store drops it from the active list. `completing` guards against double taps.
const flipped = ref(false);
const completing = ref(false);

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Derive a display status from the prompt's nullable timestamps. */
const derivedStatus = computed((): string => {
  if (props.prompt.completedAt) return "completed";
  if (props.prompt.dismissedAt) return "dismissed";
  return "pending";
});

const isActionable = computed(
  () => !props.prompt.completedAt && !props.prompt.dismissedAt,
);

const statusColor = computed((): "teal" | "purple" | "pink" | "blue" | undefined => {
  if (props.prompt.completedAt) return "teal";
  if (props.prompt.dismissedAt) return "blue";
  return "pink";
});

/** Normalised intensity key (Low/Medium/High) for label + accent styling. */
const intensityKey = computed(() => String(props.prompt.intensity).toLowerCase());
const intensityLabel = computed(() => t(`profile.intensity.${props.prompt.intensity}`));

/** Friendly duration: whole minutes when it divides cleanly, else seconds. */
const durationLabel = computed((): string => {
  const secs = Number(props.prompt.durationSeconds) || 0;
  if (secs >= 60 && secs % 60 === 0) {
    return t("interruptions.minutesLabel", { count: secs / 60 });
  }
  if (secs >= 90) {
    return t("interruptions.minutesLabel", { count: Math.round(secs / 60) });
  }
  return t("interruptions.secondsLabel", { count: secs });
});

const hasSteps = computed(() => (props.prompt.steps?.length ?? 0) > 0);

/**
 * When an activity needs gear the user owns, surface it. The prompt only carries
 * the tag, so resolve the friendly name from the registered item (falling back
 * to a prettified tag) and show the first required piece.
 */
const gearName = computed((): string | null => {
  const tags = props.prompt.equipmentTags ?? [];
  if (tags.length === 0) return null;
  const tag = tags[0]!;
  const owned = equipment.ownedByTag(tag);
  if (owned) return owned.displayName;
  return tag
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
});

const gearIcon = computed(() => equipmentIcon(props.prompt.equipmentTags?.[0] ?? ""));

/** Human-readable hold / reps / sets chips for one step. */
function stepMetrics(step: ActivityStep): string[] {
  const out: string[] = [];
  if (step.holdSeconds) out.push(t("interruptions.holdLabel", { count: Number(step.holdSeconds) }));
  if (step.reps) out.push(t("interruptions.repsLabel", { count: Number(step.reps) }));
  if (step.sets) out.push(t("interruptions.setsLabel", { count: Number(step.sets) }));
  return out;
}

// If this activity leans on registered gear, make sure the equipment list is
// loaded so the badge shows the user's own name for it (not a prettified tag).
onMounted(() => {
  if ((props.prompt.equipmentTags?.length ?? 0) > 0 && !equipment.loaded) {
    equipment.fetch();
  }
});

async function doComplete(): Promise<void> {
  // History view keeps the card in place and gathers a rating inline.
  if (props.showHistory) {
    acting.value = "complete";
    try {
      await interruptions.complete(props.prompt.id);
      showFeedback.value = true;
    } finally {
      acting.value = null;
    }
    return;
  }

  // Glance view: flip to the completed face, hold, then persist so the card
  // clears from Today. Persisting after the hold keeps the flip fully visible
  // regardless of network speed; the parent list fades the card out on removal.
  if (completing.value) return;
  completing.value = true;
  flipped.value = true;
  const reduce = prefersReducedMotion();
  const minShow = reduce ? 420 : 1120;
  try {
    await delay(minShow);
    await interruptions.complete(props.prompt.id);
  } catch {
    flipped.value = false;
    completing.value = false;
    toast.error(t("interruptions.completeError"));
  }
}

async function doDismiss(): Promise<void> {
  acting.value = "dismiss";
  try {
    await interruptions.dismiss(props.prompt.id);
  } finally {
    acting.value = null;
  }
}

function doSnooze(): void {
  interruptions.snooze(props.prompt.id, 15);
}

async function rateAndSubmit(rating: number): Promise<void> {
  feedbackRating.value = rating;
  await interruptions.sendFeedback(props.prompt.id, rating);
  showFeedback.value = false;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<style scoped>
/* ---- Flip card mechanics (glance / Today view) ----------------------------
 * .ix-item is the perspective container; .ix-flip is the 3D-preserving wrapper
 * that rotates. A positive rotateY swings the right edge toward the viewer and
 * the left edge away, landing on the pre-rotated done face. The global
 * reduced-motion rule zeroes the transition, so it snaps.
 */
.ix-item {
  perspective: 1400px;
}
.ix-flip {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.62s cubic-bezier(0.16, 1, 0.3, 1);
}
.ix-item.is-flipped .ix-flip {
  transform: rotateY(180deg);
}
.ix-flip__face {
  width: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.ix-flip__front {
  position: relative;
}
.ix-flip__back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  display: grid;
  place-items: center;
  border-color: color-mix(in srgb, var(--success) 45%, var(--line));
}
.ix-done {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  text-align: center;
}
.ix-done__mark {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.ix-done__label {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--success);
}
.ix-done__title {
  font-size: 0.85rem;
  color: var(--muted);
  max-width: 24ch;
}
@media (prefers-reduced-motion: no-preference) {
  .ix-item.is-flipped .ix-done__mark {
    animation: ix-pop 0.5s 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
@keyframes ix-pop {
  from { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.08); }
  to { transform: scale(1); opacity: 1; }
}

.interruption-card {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  animation: slide-in 0.2s ease;
}
@keyframes slide-in {
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.interruption-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.interruption-card__title {
  margin: 0;
  font-size: 1rem;
}
.interruption-card__body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--muted);
}
.interruption-card__meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.ix-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.76rem;
  font-weight: 600;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  color: var(--muted);
  background: var(--surface-2);
  white-space: nowrap;
}
.ix-meta-chip--low {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 40%, var(--line));
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.ix-meta-chip--medium {
  color: var(--accent-strong);
  border-color: var(--accent-line);
  background: var(--accent-tint);
}
.ix-meta-chip--high {
  color: var(--accent-3);
  border-color: color-mix(in srgb, var(--accent-3) 40%, var(--line));
  background: color-mix(in srgb, var(--accent-3) 12%, transparent);
}
.ix-meta-chip--gear {
  color: var(--accent-strong);
  border-color: var(--accent-line);
  background: var(--accent-tint);
}

.ix-steps {
  list-style: none;
  margin: 0.15rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border-top: 1px solid var(--line);
  padding-top: 0.75rem;
}
.ix-step {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}
.ix-step__num {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  margin-top: 0.05rem;
  border-radius: var(--radius-pill);
  background: var(--accent-tint);
  border: 1px solid var(--accent-line);
  color: var(--accent-strong);
  font-size: 0.72rem;
  font-weight: 700;
}
.ix-step__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.ix-step__text {
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--ink);
}
.ix-step__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ix-step__metric {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.interruption-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}
.interruption-card__feedback {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
}
.feedback-star {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  color: var(--muted);
  padding: 0.1rem;
  transition: color 0.1s ease, transform 0.08s ease;
}
.feedback-star:hover,
.feedback-star--sel {
  color: var(--accent-3);
  transform: scale(1.15);
}
</style>
