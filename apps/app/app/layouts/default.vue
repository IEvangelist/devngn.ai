<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <div class="shell" :class="{ 'shell--collapsed': sidebarCollapsed }">
    <a class="skip-link brut-btn brut-btn--sm" href="#main">{{ $t("common.skipToContent") }}</a>

    <!-- ── Sidebar ─────────────────────────────────────── -->
    <aside class="shell__sidebar" aria-label="Primary navigation">
      <div class="shell__brand">
        <svg class="shell__logo" viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
          <rect x="1.5" y="1.5" width="29" height="29" fill="#ff5a1f" stroke="#16130d" stroke-width="3" />
          <path d="M17.5 4 8 18.5h6L12.5 28 24 12.5h-7z" fill="#16130d" stroke="#16130d" stroke-width="1.5" stroke-linejoin="miter" />
        </svg>
        <span v-if="!sidebarCollapsed" class="shell__brandname">{{ $t("app.name") }}</span>
      </div>

      <nav class="shell__nav" aria-label="Main">
        <NavItem
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="$t(item.labelKey)"
          :collapsed="sidebarCollapsed"
        />
      </nav>

      <div class="shell__sidebar-foot">
        <BrutTooltip
          :text="sidebarCollapsed ? $t('nav.expand') : $t('nav.collapse')"
          side="right"
        >
          <button
            type="button"
            class="brut-btn brut-btn--ghost brut-btn--sm sidebar-collapse-btn"
            :aria-label="sidebarCollapsed ? $t('nav.expand') : $t('nav.collapse')"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            {{ sidebarCollapsed ? "▶" : "◀" }}
          </button>
        </BrutTooltip>
        <ThemeToggle v-if="!sidebarCollapsed" />
      </div>
    </aside>

    <!-- ── Main content area ──────────────────────────── -->
    <div class="shell__content">
      <!-- Top status bar -->
      <header class="shell__statusbar" aria-label="Status bar">
        <!-- Mobile menu toggle -->
        <button
          type="button"
          class="brut-btn brut-btn--ghost brut-btn--sm mobile-menu-btn"
          :aria-label="$t('nav.toggleMenu')"
          aria-controls="mobile-nav"
          :aria-expanded="mobileMenuOpen"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          ☰
        </button>

        <!-- Stream status indicator — role="status" permits aria-label (ARIA 1.2) -->
        <span
          class="status-indicator"
          :class="`status-indicator--${streamStatus}`"
          :title="statusLabel"
          role="status"
          aria-live="polite"
          :aria-label="statusLabel"
        >
          <span class="status-indicator__dot" aria-hidden="true" />
          <span class="status-indicator__label">{{ statusLabel }}</span>
        </span>

        <div class="statusbar__spacer" />

        <!-- XP / level widget — bound to GET /v1/gamification/me — role="group" permits aria-label -->
        <div v-if="isAuthenticated" role="group" class="statusbar__xp" aria-label="Your level and XP">
          <template v-if="playerState">
            <span class="xp-badge">
              <span aria-hidden="true">⚡</span>
              {{ $t("gamification.level", { level: Number(playerState.level) }) }}
            </span>
            <BrutProgress
              class="xp-progress"
              :value="Number(playerState.xpIntoLevel)"
              :max="Number(playerState.xpForNextLevel)"
              :label="$t('gamification.xpProgress', { into: Number(playerState.xpIntoLevel), forNext: Number(playerState.xpForNextLevel) })"
            />
            <span class="xp-badge xp-badge--streak" role="img" aria-label="Streak">
              <span aria-hidden="true">🔥</span>
              {{ Number(playerState.currentStreak) }}d
            </span>
            <span class="xp-badge xp-badge--tier">{{ playerState.rankTier }}</span>
          </template>
        </div>

        <!-- Auth avatar / sign-in -->
        <div class="statusbar__auth">
          <template v-if="isAuthenticated && user">
            <BrutMenu :items="accountMenuItems" :label="user.login ?? undefined">
              <template #trigger>
                <button
                  type="button"
                  class="avatar-trigger"
                  :aria-label="$t('common.account')"
                >
                  <BrutAvatar
                    :src="user.avatarUrl ?? undefined"
                    :alt="user.login ?? 'You'"
                    size="2rem"
                  />
                </button>
              </template>
            </BrutMenu>
          </template>
          <template v-else>
            <BrutButton size="sm" variant="accent" @click="auth.signIn()">
              {{ $t("common.signIn") }}
            </BrutButton>
          </template>
        </div>
      </header>

      <!-- Mobile nav overlay -->
      <nav
        v-if="mobileMenuOpen"
        id="mobile-nav"
        class="mobile-nav"
        aria-label="Mobile navigation"
      >
        <NavItem
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="$t(item.labelKey)"
          @click="mobileMenuOpen = false"
        />
      </nav>

      <main id="main" class="shell__main">
        <slot />
      </main>
    </div>

    <!-- Toast host -->
    <ToastHost />
    <!-- PWA update prompt -->
    <PwaUpdatePrompt />
  </div>
</template>

<script setup lang="ts">
import type { MenuItem } from "~/components/ui/BrutMenu.vue";

const auth = useAuthStore();
const { isAuthenticated, user } = storeToRefs(auth);
const interruptions = useInterruptionsStore();
const { streamStatus } = storeToRefs(interruptions);
const gamification = useGamificationStore();
const { playerState } = storeToRefs(gamification);

const { t } = useI18n();
const router = useRouter();

const accountMenuItems = computed<MenuItem[]>(() => [
  {
    key: "settings",
    label: t("nav.settings"),
    icon: "⚙",
    onSelect: () => router.push("/settings"),
  },
  {
    key: "signout",
    label: t("common.signOut"),
    icon: "⏻",
    danger: true,
    separatorBefore: true,
    onSelect: () => auth.signOut(),
  },
]);

const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);

const navItems = [
  { to: "/", icon: "☀", labelKey: "nav.today" },
  { to: "/interruptions", icon: "⏱", labelKey: "nav.interruptions" },
  { to: "/goals", icon: "◎", labelKey: "nav.goals" },
  { to: "/badges", icon: "★", labelKey: "nav.badges" },
  { to: "/milestones", icon: "◈", labelKey: "nav.milestones" },
  { to: "/leaderboard", icon: "▲", labelKey: "nav.leaderboard" },
  { to: "/social", icon: "◐", labelKey: "nav.social" },
  { to: "/settings", icon: "⚙", labelKey: "nav.settings" },
];

const statusLabel = computed(() => {
  switch (streamStatus.value) {
    case "open": return t("common.ready");
    case "connecting": return t("common.connecting");
    case "reconnecting": return t("common.reconnecting");
    default: return t("common.offline");
  }
});

// Init stores on mount
onMounted(async () => {
  await auth.init();
  await useNotificationsStore().init();
  if (auth.isAuthenticated) {
    interruptions.startStream();
    gamification.fetchPlayerState();
  }
});

// Re-connect stream when user signs in
watch(isAuthenticated, (val) => {
  if (val) {
    interruptions.startStream();
    gamification.fetchPlayerState();
  } else {
    interruptions.stopStream();
  }
});
</script>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100dvh;
  overflow: hidden;
}
.shell--collapsed {
  grid-template-columns: 52px 1fr;
}

.skip-link {
  position: absolute;
  left: -9999px;
  z-index: 100;
}
.skip-link:focus {
  left: 0.5rem;
  top: 0.5rem;
}

/* ── Sidebar ─────────────────────────── */
.shell__sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 0.75rem;
  background: var(--paper-2);
  border-right: var(--border);
  overflow-x: hidden;
  overflow-y: auto;
  transition: width 0.15s ease;
}
.shell__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.01em;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
}
.shell__logo {
  width: 1.4em;
  height: 1.4em;
  flex: 0 0 auto;
  display: block;
}
.shell__nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}
.shell__sidebar-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
}
.sidebar-collapse-btn {
  align-self: flex-start;
}

/* ── Content area ────────────────────── */
.shell__content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Status bar ──────────────────────── */
.shell__statusbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: var(--border);
  background: var(--paper-2);
  flex-wrap: wrap;
  min-height: 3rem;
}
.statusbar__spacer { flex: 1; }
.statusbar__auth { display: flex; align-items: center; gap: 0.5rem; }
.avatar-trigger {
  display: inline-flex;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  cursor: pointer;
  outline: none;
}
.avatar-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.statusbar__xp { display: flex; align-items: center; gap: 0.4rem; }

.xp-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
}
.xp-badge--streak { background: var(--accent-tint); border-color: var(--accent-line); color: var(--accent-strong); }
.xp-badge--tier {
  background: var(--surface-2);
  font-size: 0.68rem;
  opacity: 0.9;
}
.xp-progress {
  width: 5rem;
  height: 0.6rem;
  flex: 0 0 auto;
}

/* Stream status indicator */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--muted);
}
.status-indicator__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--muted);
  flex: 0 0 auto;
}
.status-indicator--open .status-indicator__dot { background: var(--success); }
.status-indicator--connecting .status-indicator__dot,
.status-indicator--reconnecting .status-indicator__dot {
  background: var(--accent-3);
  animation: pulse 1s ease infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.mobile-menu-btn { display: none; }

.shell__main {
  flex: 1;
  min-height: 0;
  padding: 1.75rem clamp(1rem, 4vw, 2.5rem);
  overflow-y: auto;
}

/* Mobile nav */
.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border-bottom: var(--border);
  background: var(--paper-2);
}

/* ── Responsive ──────────────────────── */
@media (max-width: 720px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }
  .shell__sidebar {
    display: none;
  }
  .shell__content {
    grid-column: 1;
  }
  .mobile-menu-btn {
    display: flex;
  }
}
</style>
