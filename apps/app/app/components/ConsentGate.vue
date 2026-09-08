<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <div class="consent-gate">
    <div class="consent-gate__theme">
      <ThemeToggle />
    </div>

    <main class="consent-gate__inner">
      <div class="consent-gate__brand">
        <img
          class="consent-gate__logo"
          src="/favicon.svg"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <BrandWordmark class="consent-gate__wordmark" />
      </div>

      <h1 class="consent-gate__title">{{ $t("consent.title") }}</h1>
      <p class="consent-gate__subtitle">{{ $t("consent.subtitle") }}</p>

      <BrutPanel class="consent-gate__panel">
        <div v-if="loading && !current" class="consent-gate__state" role="status">
          {{ $t("consent.loading") }}
        </div>

        <template v-else-if="current">
          <p class="brut-eyebrow">
            {{ $t("consent.version", { version: current.version }) }}
          </p>
          <div class="consent-gate__text" tabindex="0">{{ current.text }}</div>

          <div v-if="error" class="consent-gate__error" role="alert">
            {{
              error === "accept"
                ? $t("consent.acceptError")
                : $t("consent.loadError")
            }}
          </div>

          <BrutButton
            variant="accent"
            block
            :loading="accepting"
            :disabled="accepting"
            @click="consent.acceptCurrent()"
          >
            {{ $t("consent.accept") }}
          </BrutButton>
        </template>

        <div v-else class="consent-gate__state consent-gate__state--error" role="alert">
          <p>{{ $t("consent.loadError") }}</p>
          <BrutButton size="sm" variant="ghost" @click="consent.load()">
            {{ $t("common.retry") }}
          </BrutButton>
        </div>

        <BrutButton
          class="consent-gate__signout"
          size="sm"
          variant="ghost"
          @click="signOut"
        >
          {{ $t("common.signOut") }}
        </BrutButton>
      </BrutPanel>
    </main>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore();
const consent = useConsentStore();
const { current, loading, accepting, error } = storeToRefs(consent);

onMounted(() => {
  if (!current.value && !loading.value) {
    void consent.load();
  }
});

async function signOut(): Promise<void> {
  consent.reset();
  await auth.signOut();
}
</script>

<style scoped>
.consent-gate {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  background: var(--paper);
  color: var(--ink);
}

.consent-gate__theme {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.consent-gate__inner {
  width: min(100%, 42rem);
}

.consent-gate__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.consent-gate__logo {
  width: 2.25rem;
  height: 2.25rem;
}

.consent-gate__wordmark {
  font-size: 1.35rem;
  font-weight: 900;
}

.consent-gate__title {
  margin: 0;
  font-size: clamp(1.8rem, 5vw, 2.6rem);
  line-height: 1.05;
}

.consent-gate__subtitle {
  margin: 0.65rem 0 1.25rem;
  color: var(--muted);
  line-height: 1.5;
}

.consent-gate__panel {
  display: grid;
  gap: 1rem;
}

.consent-gate__text {
  max-height: min(42dvh, 24rem);
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--line);
  background: var(--paper-2);
  font-family: var(--font-mono);
  font-size: 0.86rem;
  line-height: 1.6;
  white-space: pre-wrap;
}

.consent-gate__state {
  color: var(--muted);
  font-family: var(--font-mono);
}

.consent-gate__state--error,
.consent-gate__error {
  color: var(--danger);
}

.consent-gate__state--error p {
  margin-top: 0;
}

.consent-gate__signout {
  justify-self: center;
}
</style>
