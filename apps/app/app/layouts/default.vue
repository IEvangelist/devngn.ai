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
        <span class="shell__logo" aria-hidden="true">◆</span>
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
        <button
          type="button"
          class="brut-btn brut-btn--ghost brut-btn--sm sidebar-collapse-btn"
          :aria-label="sidebarCollapsed ? $t('nav.expand') : $t('nav.collapse')"
          :title="sidebarCollapsed ? $t('nav.expand') : $t('nav.collapse')"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          {{ sidebarCollapsed ? "▶" : "◀" }}
        </button>
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

        <!-- Stream status indicator -->
        <span
          class="status-indicator"
          :class="`status-indicator--${streamStatus}`"
          :title="statusLabel"
          aria-live="polite"
          :aria-label="statusLabel"
        >
          <span class="status-indicator__dot" aria-hidden="true" />
          <span class="status-indicator__label">{{ statusLabel }}</span>
        </span>

        <div class="statusbar__spacer" />

        <!-- XP / level slot (wave2: binds to gamificationStore) -->
        <div v-if="isAuthenticated" class="statusbar__xp" aria-label="Your level and XP">
          <span class="xp-badge">
            <span aria-hidden="true">⚡</span>
            {{ $t("gamification.level", { level: gamification.userLevel.level }) }}
          </span>
          <span class="xp-badge xp-badge--streak" aria-label="Streak">
            <span aria-hidden="true">🔥</span>
            {{ gamification.userLevel.streak }}d
          </span>
        </div>

        <!-- Auth avatar / sign-in -->
        <div class="statusbar__auth">
          <template v-if="isAuthenticated && user">
            <BrutAvatar
              :src="user.avatarUrl ?? undefined"
              :alt="user.login ?? 'You'"
              size="2rem"
            />
            <button
              type="button"
              class="brut-btn brut-btn--ghost brut-btn--sm"
              @click="auth.signOut()"
            >
              {{ $t("common.signOut") }}
            </button>
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
const auth = useAuthStore();
const { isAuthenticated, user } = storeToRefs(auth);
const interruptions = useInterruptionsStore();
const { streamStatus } = storeToRefs(interruptions);
const gamification = useGamificationStore();

const { t } = useI18n();

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
  }
});

// Re-connect stream when user signs in
watch(isAuthenticated, (val) => {
  if (val) interruptions.startStream();
  else interruptions.stopStream();
});
</script>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
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
  overflow: hidden;
  transition: width 0.15s ease;
}
.shell__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1.4rem;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
}
.shell__logo { color: var(--accent); flex: 0 0 auto; }
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
  min-height: 100vh;
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
.statusbar__xp { display: flex; align-items: center; gap: 0.4rem; }

.xp-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border: 2px solid var(--ink);
  background: var(--accent-3);
  color: var(--accent-ink);
}
.xp-badge--streak { background: var(--accent); color: var(--accent-ink); }

/* Stream status indicator */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
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
    grid-template-rows: auto 1fr;
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
