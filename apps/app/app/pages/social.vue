<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/social/* via social store.
  Schema notes:
    - SocialProfileResponse: userId, displayName, bio, isPublic (no avatarUrl/login)
    - FollowerResponse: followerId + followedAt (no display names — counts only)
    - FollowResponse:   followeeId + followedAt (no display names — counts only)
    - FeedItemResponse: id, type (FeedItemType enum), message, createdAt (no per-user data or likes)
    - Profanity filter is server-side; UI just shows the server-sanitized value.
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("social.title") }}</h1>

    <div v-if="!isAuthenticated" class="state-msg">
      {{ $t("leaderboard.signIn") }}
    </div>

    <div v-else class="social-layout">
      <!-- ── Profile card ──────────────────────────────── -->
      <div class="social-panel brut-card">
        <h2 class="section-label">{{ $t("social.profile") }}</h2>

        <div v-if="loadingProfile" class="state-msg" role="status" aria-live="polite">
          <span aria-hidden="true">⏳</span> {{ $t("common.loading") }}
        </div>
        <div v-else-if="errorProfile" class="state-msg state-msg--error" role="alert">
          <span aria-hidden="true">⚠</span> {{ errorProfile }}
        </div>
        <template v-else>
          <!-- Follow stats -->
          <div class="follow-stats">
            <span class="follow-stat">
              <strong>{{ followers.length }}</strong>
              <span class="brut-eyebrow">{{ $t("social.followers") }}</span>
            </span>
            <span class="follow-stat">
              <strong>{{ following.length }}</strong>
              <span class="brut-eyebrow">{{ $t("social.following") }}</span>
            </span>
          </div>

          <!-- Profile edit form -->
          <form class="profile-form" aria-label="Edit profile" @submit.prevent="saveProfile">
            <div class="form-field">
              <label class="form-label" for="displayName">{{ $t("social.displayName") }}</label>
              <input
                id="displayName"
                v-model="form.displayName"
                class="brut-input"
                type="text"
                maxlength="64"
                :placeholder="$t('social.displayName')"
                required
                autocomplete="nickname"
              />
            </div>

            <div class="form-field">
              <label class="form-label" for="bio">{{ $t("social.bio") }}</label>
              <textarea
                id="bio"
                v-model="form.bio"
                class="brut-input brut-textarea"
                rows="3"
                maxlength="280"
                :placeholder="$t('social.bioPlaceholder')"
              />
              <span class="form-hint brut-eyebrow">{{ $t("social.bioSanitized") }}</span>
            </div>

            <div class="form-field form-field--inline">
              <BrutToggle
                v-model="form.isPublic"
                :label="$t('social.publicProfile')"
              />
            </div>

            <div class="form-actions">
              <BrutButton type="submit" variant="accent" size="sm" :disabled="saving">
                {{ saving ? $t("common.loading") : $t("social.saveProfile") }}
              </BrutButton>
            </div>
          </form>
        </template>
      </div>

      <!-- ── Activity feed ─────────────────────────────── -->
      <div class="social-feed">
        <h2 class="section-label">{{ $t("social.feed") }}</h2>

        <div v-if="loadingFeed" class="state-msg" role="status" aria-live="polite">
          <span aria-hidden="true">⏳</span> {{ $t("social.feedLoading") }}
        </div>
        <div v-else-if="errorFeed" class="state-msg state-msg--error" role="alert">
          <span aria-hidden="true">⚠</span> {{ errorFeed }}
          <BrutButton size="sm" variant="ghost" @click="social.fetchFeed()">{{ $t("common.retry") }}</BrutButton>
        </div>
        <p v-else-if="feed.length === 0" class="state-msg">
          {{ $t("social.feedEmpty") }}
        </p>

        <div v-else class="feed-list" role="list">
          <article
            v-for="item in feed"
            :key="item.id"
            class="feed-card brut-card"
            :class="`feed-card--${item.type.toLowerCase()}`"
            role="listitem"
          >
            <header class="feed-card__header">
              <span class="feed-card__type-icon" aria-hidden="true">{{ feedTypeIcon(item.type) }}</span>
              <BrutChip class="feed-card__type-chip">{{ feedTypeLabel(item.type) }}</BrutChip>
              <time
                class="feed-card__time brut-eyebrow"
                :datetime="item.createdAt"
              >
                {{ formatRelative(item.createdAt) }}
              </time>
            </header>
            <p class="feed-card__message">{{ item.message }}</p>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { FeedItemType } from "~/types/gamification";

const social = useSocialStore();
const auth = useAuthStore();
const { isAuthenticated } = storeToRefs(auth);
const { profile, followers, following, feed, loadingProfile, loadingFeed, errorProfile, errorFeed } =
  storeToRefs(social);

const { t } = useI18n();
const toast = useToast();

const saving = ref(false);
const form = reactive({
  displayName: "",
  bio: "",
  isPublic: true,
});

watch(profile, (p) => {
  if (!p) return;
  form.displayName = p.displayName ?? "";
  form.bio = p.bio ?? "";
  form.isPublic = p.isPublic ?? true;
}, { immediate: true });

async function saveProfile(): Promise<void> {
  saving.value = true;
  try {
    await social.upsertProfile({
      displayName: form.displayName,
      bio: form.bio || null,
      isPublic: form.isPublic,
    });
    toast.success(t("social.profileSaved"));
  } catch {
    toast.error(t("social.profileError"));
  } finally {
    saving.value = false;
  }
}

const FEED_ICONS: Record<FeedItemType, string> = {
  PromptCompleted:    "✅",
  BadgeEarned:       "★",
  MilestoneAchieved: "◈",
  LevelUp:           "⚡",
  GoalCreated:       "◎",
  Followed:          "◐",
};

const FEED_LABELS: Record<FeedItemType, string> = {
  PromptCompleted:    "break",
  BadgeEarned:       "badge",
  MilestoneAchieved: "milestone",
  LevelUp:           "level up",
  GoalCreated:       "goal",
  Followed:          "social",
};

function feedTypeIcon(type: FeedItemType): string {
  return FEED_ICONS[type] ?? "◆";
}

function feedTypeLabel(type: FeedItemType): string {
  return FEED_LABELS[type] ?? type;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

onMounted(() => {
  if (isAuthenticated.value) social.fetchAll();
});

watch(isAuthenticated, (val) => {
  if (val) social.fetchAll();
});
</script>

<style scoped>
.social-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  margin-top: 1rem;
  align-items: start;
}
@media (max-width: 720px) {
  .social-layout { grid-template-columns: 1fr; }
}

.state-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.state-msg--error { color: var(--danger); }

.section-label {
  font-size: 0.85rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 1rem;
}

/* Profile panel */
.social-panel { display: flex; flex-direction: column; gap: 1rem; }

.follow-stats {
  display: flex;
  gap: 1.5rem;
}
.follow-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}
.follow-stat strong {
  font-family: var(--font-display);
  font-size: 1.4rem;
}

/* Profile form */
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.form-field--inline { flex-direction: row; align-items: center; gap: 0.5rem; }
.form-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.brut-input {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  padding: 0.5rem 0.65rem;
  border: var(--border);
  background: var(--surface-bg);
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
}
.brut-input:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}
.brut-textarea { resize: vertical; min-height: 5rem; }
.form-hint { font-size: 0.65rem; color: var(--muted); }
.form-actions { display: flex; gap: 0.5rem; }

/* Feed */
.social-feed { display: flex; flex-direction: column; gap: 0.25rem; }
.feed-list { display: flex; flex-direction: column; gap: 0.75rem; }

.feed-card { display: flex; flex-direction: column; gap: 0.5rem; }
.feed-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.feed-card__type-icon { font-size: 1.1rem; }
.feed-card__time {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--muted);
}
.feed-card__message { margin: 0; line-height: 1.5; font-size: 0.95rem; }

/* Per-type accent left borders */
.feed-card--badgeearned       { border-left: 3px solid var(--accent-3); }
.feed-card--milestoneachieved { border-left: 3px solid var(--accent-2); }
.feed-card--levelup           { border-left: 3px solid var(--accent);   }
.feed-card--promptcompleted   { border-left: 3px solid var(--success);  }
.feed-card--goalcreated       { border-left: 3px solid var(--accent-4); }
.feed-card--followed          { border-left: 3px solid var(--accent-5); }
</style>
