<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("today.title") }}</h1>

    <!-- Auth gate -->
    <template v-if="!isAuthenticated">
      <BrutPanel>
        <p>{{ $t("auth.subtitle") }}</p>
        <BrutButton
          variant="accent"
          :loading="auth.isSigningIn"
          :disabled="auth.isSigningIn"
          @click="auth.signIn()"
        >
          {{ $t("auth.githubButton") }}
        </BrutButton>

        <!-- Sign-in error surface -->
        <div v-if="auth.signInError" class="auth-error" role="alert">
          <p class="auth-error__title">{{ $t("auth.errorTitle") }}</p>
          <p class="auth-error__detail">{{ auth.signInError }}</p>
          <p class="auth-error__hint">{{ $t("auth.errorHint") }}</p>
        </div>

        <!-- Dev-only sign-in bypass (compiled out of production builds) -->
        <div v-if="isDev" class="auth-dev">
          <BrutButton
            variant="ghost"
            size="sm"
            :disabled="auth.isSigningIn"
            @click="auth.devSignIn()"
          >
            {{ $t("auth.devButton") }}
          </BrutButton>
          <span class="auth-dev__hint">{{ $t("auth.devHint") }}</span>
        </div>

        <!-- Device flow modal -->
        <BrutModal
          :open="!!auth.deviceFlow"
          :title="$t('auth.title')"
          :close-on-backdrop="false"
          @close="() => {}"
        >
          <p class="brut-eyebrow">{{ $t("auth.deviceInstruction", { url: auth.deviceFlow?.verificationUri }) }}</p>
          <p class="device-code">{{ auth.deviceFlow?.userCode }}</p>
          <p>{{ $t("auth.waiting") }}</p>
        </BrutModal>
      </BrutPanel>
    </template>

    <!-- Live interruption feed -->
    <template v-else>
      <!-- XP progress strip -->
      <div class="today__xp-strip">
        <BrutProgress
          :value="Number(gamification.playerState?.xpIntoLevel ?? 0)"
          :max="Number(gamification.playerState?.xpForNextLevel ?? 100)"
          :label="$t('gamification.xpToNext', { remaining: Number(gamification.playerState?.xpForNextLevel ?? 0) - Number(gamification.playerState?.xpIntoLevel ?? 0), level: Number(gamification.playerState?.level ?? 1) + 1 })"
          show-label
          class="today__xp-bar"
        />
        <BrutBadge color="accent" icon="⚡">
          {{ $t("gamification.level", { level: Number(gamification.playerState?.level ?? 1) }) }}
        </BrutBadge>
      </div>

      <!-- Active interruptions -->
      <div v-if="activePrompts.length" class="today__cards">
        <InterruptionCard
          v-for="prompt in activePrompts"
          :key="prompt.id"
          :prompt="prompt"
        />
      </div>
      <BrutPanel v-else class="today__empty">
        <p>{{ $t("today.empty") }}</p>
      </BrutPanel>
    </template>
  </section>
</template>

<script setup lang="ts">
const auth = useAuthStore();
const { isAuthenticated } = storeToRefs(auth);
// Dev-only sign-in bypass button visibility; `import.meta.dev` is statically
// replaced at build time, so the branch is tree-shaken out of production.
const isDev = import.meta.dev;
const interruptions = useInterruptionsStore();
const { activePrompts } = storeToRefs(interruptions);
const gamification = useGamificationStore();
</script>

<style scoped>
.today__xp-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.today__xp-bar { flex: 1; }
.today__cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.today__empty {
  text-align: center;
  color: var(--muted);
}
.device-code {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  text-align: center;
  border: var(--border);
  padding: 0.5rem 1rem;
  margin: 0.75rem 0;
}
.auth-error {
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  border: var(--border);
  border-left-width: 6px;
  border-left-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--paper-2));
}
.auth-error__title {
  font-weight: 800;
  margin: 0 0 0.25rem;
}
.auth-error__detail {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  margin: 0 0 0.35rem;
}
.auth-error__hint {
  font-size: 0.85rem;
  color: var(--muted);
  margin: 0;
}
.auth-dev {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px dashed var(--border-color, var(--muted));
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.auth-dev__hint {
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
