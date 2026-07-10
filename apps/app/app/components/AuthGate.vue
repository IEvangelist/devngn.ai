<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <!--
    The single, focused signed-out experience. Rendered by the layout in place
    of the app shell whenever there is no session, so every route shows one
    consistent sign-in screen instead of broken, 401-ing page content. It owns
    the whole sign-in flow (GitHub button, dev bypass, device-flow modal, and
    error surface) so signing in works from anywhere.
  -->
  <div class="authgate">
    <div class="authgate__theme">
      <ThemeToggle />
    </div>

    <main class="authgate__inner">
      <div class="authgate__brand">
        <svg class="authgate__logo" viewBox="0 0 32 32" role="img" :aria-label="$t('app.name')">
          <rect x="1.5" y="1.5" width="14.5" height="29" fill="#ec1c8b" />
          <rect x="16" y="1.5" width="14.5" height="29" fill="#11b3a3" />
          <rect x="1.5" y="1.5" width="29" height="29" fill="none" stroke="#16130d" stroke-width="3" />
          <path d="M17.5 4 8 18.5h6L12.5 28 24 12.5h-7z" fill="#16130d" stroke="#16130d" stroke-width="1.5" stroke-linejoin="miter" />
        </svg>
        <span class="authgate__wordmark">{{ $t("app.name") }}</span>
      </div>

      <h1 class="authgate__title">{{ $t("auth.title") }}</h1>
      <p class="authgate__sub">{{ $t("auth.subtitle") }}</p>

      <BrutPanel class="authgate__card">
        <BrutButton
          variant="accent"
          block
          :loading="auth.isSigningIn"
          :disabled="auth.isSigningIn"
          @click="auth.signIn()"
        >
          {{ $t("auth.githubButton") }}
        </BrutButton>

        <div v-if="auth.signInError" class="authgate__error" role="alert">
          <p class="authgate__error-title">{{ $t("auth.errorTitle") }}</p>
          <p class="authgate__error-detail">{{ auth.signInError }}</p>
          <p class="authgate__error-hint">{{ $t("auth.errorHint") }}</p>
        </div>

        <div v-if="isDev" class="authgate__dev">
          <BrutButton
            variant="ghost"
            size="sm"
            :disabled="auth.isSigningIn"
            @click="auth.devSignIn()"
          >
            {{ $t("auth.devButton") }}
          </BrutButton>
          <span class="authgate__dev-hint">{{ $t("auth.devHint") }}</span>
        </div>
      </BrutPanel>
    </main>

    <BrutModal
      :open="!!auth.deviceFlow"
      :title="$t('auth.title')"
      :close-on-backdrop="false"
      @close="() => {}"
    >
      <p class="brut-eyebrow">{{ $t("auth.deviceInstruction", { url: auth.deviceFlow?.verificationUri }) }}</p>
      <p class="authgate__code">{{ auth.deviceFlow?.userCode }}</p>
      <p>{{ $t("auth.waiting") }}</p>
    </BrutModal>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore();
// `import.meta.dev` is statically replaced at build time, so the dev bypass is
// tree-shaken out of production builds.
const isDev = import.meta.dev;
</script>

<style scoped>
.authgate {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background: var(--paper);
  color: var(--ink);
}

.authgate__theme {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
}

.authgate__inner {
  width: min(100%, 26rem);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.authgate__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.authgate__logo {
  width: 2.25rem;
  height: 2.25rem;
}

.authgate__wordmark {
  font-weight: 900;
  font-size: 1.35rem;
  letter-spacing: -0.01em;
}

.authgate__title {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.authgate__sub {
  margin: 0 0 0.5rem;
  max-width: 34ch;
  color: var(--muted);
  line-height: 1.5;
}

.authgate__card {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.authgate__error {
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  border: var(--border);
  border-left-width: 6px;
  border-left-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--paper-2));
}

.authgate__error-title {
  font-weight: 800;
  margin: 0 0 0.25rem;
}

.authgate__error-detail {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  margin: 0 0 0.35rem;
  word-break: break-word;
}

.authgate__error-hint {
  font-size: 0.85rem;
  color: var(--muted);
  margin: 0;
}

.authgate__dev {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px dashed var(--line);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.authgate__dev-hint {
  font-size: 0.8rem;
  color: var(--muted);
}

.authgate__code {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  text-align: center;
  border: var(--border);
  padding: 0.5rem 1rem;
  margin: 0.75rem 0;
}

/* A quiet lift-in that draws the eye to the sign-in card without theatrics.
   Collapses to a static screen under reduced-motion. */
@media (prefers-reduced-motion: no-preference) {
  .authgate__inner {
    animation: authgate-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes authgate-rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
