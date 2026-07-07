<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section class="auth-callback" aria-labelledby="auth-callback-title">
    <BrutPanel class="auth-callback__panel">
      <p class="brut-eyebrow">{{ $t("app.name") }}</p>
      <h1 id="auth-callback-title">
        {{ status === "error" ? $t("auth.callback.errorTitle") : $t("auth.callback.title") }}
      </h1>

      <p
        v-if="status !== 'error'"
        class="auth-callback__status"
        role="status"
        aria-live="polite"
      >
        {{ status === "redirecting" ? $t("auth.callback.redirecting") : $t("auth.callback.processing") }}
      </p>

      <div
        v-else
        class="auth-callback__error"
        role="alert"
        aria-live="assertive"
      >
        <p>{{ errorMessage }}</p>
        <NuxtLink class="brut-btn brut-btn--accent auth-callback__link" to="/">
          {{ $t("auth.callback.retry") }}
        </NuxtLink>
      </div>
    </BrutPanel>
  </section>
</template>

<script setup lang="ts">
import {
  AUTH_CALLBACK_NONCE_KEY,
  hasValidAuthCallbackNonce,
  parseAuthCallbackFragment,
} from "~/utils/authCallback";

type CallbackStatus = "processing" | "redirecting" | "error";

const auth = useAuthStore();
const { t } = useI18n();

const status = ref<CallbackStatus>("processing");
const errorMessage = ref("");

function fail(message: string): void {
  status.value = "error";
  errorMessage.value = message;
  auth.signInError = message;
  auth.isSigningIn = false;
}

function clearCallbackUrl(): void {
  window.history.replaceState(null, document.title, window.location.pathname);
}

onMounted(async () => {
  if (typeof window === "undefined") return;

  const parsed = parseAuthCallbackFragment(window.location.hash);
  const storedNonce = window.sessionStorage.getItem(AUTH_CALLBACK_NONCE_KEY);
  const nonceIsValid = hasValidAuthCallbackNonce(window.location.search, storedNonce);

  window.sessionStorage.removeItem(AUTH_CALLBACK_NONCE_KEY);
  clearCallbackUrl();

  if (!nonceIsValid) {
    fail(t("auth.callback.securityMismatch"));
    return;
  }

  if (parsed.kind === "error") {
    const description = parsed.errorDescription ?? parsed.error;
    fail(t("auth.callback.providerError", { description }));
    return;
  }

  if (parsed.kind === "missing-token") {
    fail(t("auth.callback.missingToken"));
    return;
  }

  try {
    await auth.handleCallback(parsed.accessToken);
    status.value = "redirecting";
    await navigateTo("/");
  } catch {
    fail(t("auth.callback.errorDescription"));
  }
});
</script>

<style scoped>
.auth-callback {
  display: grid;
  place-items: center;
  min-height: min(42rem, 70vh);
}

.auth-callback__panel {
  width: min(100%, 38rem);
}

.auth-callback__status,
.auth-callback__error {
  margin: 0;
  max-width: 62ch;
}

.auth-callback__error {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-callback__error p {
  margin: 0;
  color: var(--danger);
  font-weight: 700;
}

.auth-callback__link {
  align-self: flex-start;
  text-decoration: none;
}
</style>
