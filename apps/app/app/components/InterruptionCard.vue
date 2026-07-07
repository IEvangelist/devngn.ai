<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Reusable interruption card used on Today and Interruptions pages.
-->
<template>
  <article class="interruption-card brut-card" :aria-label="prompt.activityTitle">
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

    <!-- Actions — only for pending prompts (not yet dismissed or completed) -->
    <footer v-if="isActionable" class="interruption-card__actions">
      <BrutButton size="sm" variant="accent" :loading="acting === 'complete'" @click="doComplete">
        {{ $t("interruptions.completeCta") }}
      </BrutButton>
      <BrutButton size="sm" :loading="acting === 'snooze'" @click="doSnooze">
        {{ $t("interruptions.snoozeCta") }}
      </BrutButton>
      <BrutButton size="sm" variant="ghost" :loading="acting === 'dismiss'" @click="doDismiss">
        {{ $t("interruptions.dismissCta") }}
      </BrutButton>

      <!-- Inline feedback (shown after complete) -->
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
</template>

<script setup lang="ts">
import type { PromptResponse } from "@devngn/wellness-types";

const props = defineProps<{
  prompt: PromptResponse;
  showHistory?: boolean;
}>();

const interruptions = useInterruptionsStore();
const acting = ref<"complete" | "snooze" | "dismiss" | null>(null);
const showFeedback = ref(false);
const feedbackRating = ref(0);

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
  acting.value = "complete";
  try {
    await interruptions.complete(props.prompt.id);
    showFeedback.value = true;
  } finally {
    acting.value = null;
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
