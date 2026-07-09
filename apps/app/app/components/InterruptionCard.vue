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
        <p class="interruption-card__body">{{ prompt.activityDescription }}</p>

        <div v-if="showHistory" class="interruption-card__meta brut-eyebrow">
          {{ prompt.intensity }} · {{ prompt.durationSeconds }}s
        </div>

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
import type { PromptResponse } from "@devngn/wellness-types";

const props = defineProps<{
  prompt: PromptResponse;
  showHistory?: boolean;
}>();

const interruptions = useInterruptionsStore();
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
  color: var(--muted);
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
