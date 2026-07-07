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
        <BrutButton variant="accent" @click="auth.signIn()">
          {{ $t("auth.githubButton") }}
        </BrutButton>

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
          :value="gamification.userLevel.xp"
          :max="gamification.userLevel.xpToNext"
          :label="$t('gamification.xpToNext', { remaining: gamification.userLevel.xpToNext - gamification.userLevel.xp, level: gamification.userLevel.level + 1 })"
          show-label
          class="today__xp-bar"
        />
        <BrutBadge color="accent" icon="⚡">
          {{ $t("gamification.level", { level: gamification.userLevel.level }) }}
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
</style>
