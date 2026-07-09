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
  <section class="page">
    <PageHeader :title="$t('social.title')" :intro="$t('social.intro')" />

    <div v-if="!isAuthenticated" class="state-msg">
      {{ $t("leaderboard.signIn") }}
    </div>

    <div v-else class="social-layout">
      <!-- ── Profile ───────────────────────────────────── -->
      <aside class="social-profile brut-card reveal reveal--0">
        <div v-if="loadingProfile" class="state-msg" role="status" aria-live="polite">
          <span aria-hidden="true">⏳</span> {{ $t("common.loading") }}
        </div>
        <div v-else-if="errorProfile" class="state-msg state-msg--error" role="alert">
          <span aria-hidden="true">⚠</span> {{ errorProfile }}
        </div>
        <template v-else>
          <!-- Identity header -->
          <header class="profile-id">
            <span class="profile-id__avatar" aria-hidden="true">{{ profileInitial }}</span>
            <span class="profile-id__text">
              <span class="profile-id__name">{{ form.displayName || $t("social.displayName") }}</span>
              <span
                class="profile-id__vis"
                :class="form.isPublic ? 'profile-id__vis--public' : 'profile-id__vis--private'"
              >
                <AppIcon :name="form.isPublic ? 'globe' : 'lock'" class="profile-id__vis-icon" />
                {{ form.isPublic ? $t("social.public") : $t("social.private") }}
              </span>
            </span>
          </header>

          <!-- Follow stats -->
          <dl class="follow-stats">
            <div class="follow-stat">
              <dd class="follow-stat__num">{{ followers.length }}</dd>
              <dt class="follow-stat__label brut-eyebrow">{{ $t("social.followers") }}</dt>
            </div>
            <div class="follow-stat">
              <dd class="follow-stat__num">{{ following.length }}</dd>
              <dt class="follow-stat__label brut-eyebrow">{{ $t("social.following") }}</dt>
            </div>
          </dl>

          <hr class="profile-rule" />

          <!-- Profile edit form -->
          <form class="profile-form" aria-label="Edit profile" @submit.prevent="saveProfile">
            <span class="section-label profile-form__label">{{ $t("social.editProfile") }}</span>
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
      </aside>

      <!-- ── Activity timeline ─────────────────────────── -->
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

        <ol v-else class="timeline" role="list">
          <li
            v-for="(item, idx) in feed"
            :key="item.id"
            class="tl-item"
            :style="{ '--i': idx }"
            role="listitem"
          >
            <span
              class="tl-item__marker"
              :class="`tl-item__marker--${item.type.toLowerCase()}`"
              aria-hidden="true"
            >
              <AppIcon :name="feedTypeIcon(item.type)" />
            </span>
            <div class="tl-item__body">
              <div class="tl-item__meta">
                <span class="tl-item__kind">{{ feedTypeLabel(item.type) }}</span>
                <time class="tl-item__time" :datetime="item.createdAt">
                  {{ formatRelative(item.createdAt) }}
                </time>
              </div>
              <p class="tl-item__message">{{ item.message }}</p>
            </div>
          </li>
        </ol>
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

const profileInitial = computed(() =>
  (form.displayName || profile.value?.displayName || "?").charAt(0).toUpperCase(),
);

const FEED_ICONS: Record<FeedItemType, string> = {
  PromptCompleted:   "check-circle",
  BadgeEarned:       "medal",
  MilestoneAchieved: "flag",
  LevelUp:           "lightning",
  GoalCreated:       "target",
  Followed:          "user-plus",
};

const FEED_LABELS: Record<FeedItemType, string> = {
  PromptCompleted:   "Break",
  BadgeEarned:       "Badge",
  MilestoneAchieved: "Milestone",
  LevelUp:           "Level up",
  GoalCreated:       "Goal",
  Followed:          "Follow",
};

function feedTypeIcon(type: FeedItemType): string {
  return FEED_ICONS[type] ?? "check-circle";
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
  margin-top: 1.25rem;
  align-items: start;
}
@media (max-width: 820px) {
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

/* ── Profile panel ─────────────────────────────────────── */
.social-profile {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  position: sticky;
  top: 1rem;
}
@media (max-width: 820px) {
  .social-profile { position: static; }
}

.profile-id {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.profile-id__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.25rem;
  color: var(--accent);
}
.profile-id__text {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.profile-id__name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--ink);
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.profile-id__vis {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  align-self: flex-start;
  padding: 0.12rem 0.55rem 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--line);
}
.profile-id__vis-icon { font-size: 0.82rem; }
.profile-id__vis--public {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  border-color: color-mix(in srgb, var(--success) 35%, var(--line));
}
.profile-id__vis--private {
  color: var(--muted);
  background: var(--surface-2);
}

/* Follow stats */
.follow-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0;
}
.follow-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.65rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.follow-stat__num {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--ink);
}
.follow-stat__label { color: var(--muted); }

.profile-rule {
  border: none;
  border-top: 1px solid var(--line);
  margin: 0;
}

/* Profile form */
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.profile-form__label { margin-bottom: -0.2rem; }
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

/* ── Activity timeline ─────────────────────────────────── */
.social-feed { display: flex; flex-direction: column; }
.social-feed .section-label { margin-bottom: 1.1rem; }

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl-item {
  position: relative;
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 0.9rem;
  padding-bottom: 1.15rem;
}
/* Connector rail: runs from this marker's centre to the next marker's centre;
   opaque markers sit on top, giving a beads-on-a-string read. */
.tl-item::before {
  content: "";
  position: absolute;
  left: 1.25rem;
  transform: translateX(-50%);
  top: 1.25rem;
  bottom: -1.25rem;
  width: 2px;
  background: var(--line);
  z-index: 0;
}
.tl-item:last-child { padding-bottom: 0; }
.tl-item:last-child::before { display: none; }

.tl-item__marker {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  font-size: 1.15rem;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.tl-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-top: 0.15rem;
  min-width: 0;
}
.tl-item__meta {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.tl-item__kind {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--ink);
}
.tl-item__time {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted);
  white-space: nowrap;
}
.tl-item__message {
  margin: 0;
  line-height: 1.5;
  font-size: 0.92rem;
  color: var(--text);
  overflow-wrap: anywhere;
}

/* Per-type marker colours (mirrors the previous accent left-borders). */
.tl-item__marker--promptcompleted {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--success) 35%, var(--line));
}
.tl-item__marker--badgeearned {
  color: var(--accent-3);
  background: color-mix(in srgb, var(--accent-3) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent-3) 35%, var(--line));
}
.tl-item__marker--milestoneachieved {
  color: var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent-2) 35%, var(--line));
}
.tl-item__marker--levelup {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
}
.tl-item__marker--goalcreated {
  color: var(--accent-4);
  background: color-mix(in srgb, var(--accent-4) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent-4) 35%, var(--line));
}
.tl-item__marker--followed {
  color: var(--accent-5);
  background: color-mix(in srgb, var(--accent-5) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent-5) 35%, var(--line));
}

/* Staggered entrance, motion-gated. */
@media (prefers-reduced-motion: no-preference) {
  .tl-item {
    animation: app-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: min(calc(var(--i) * 55ms), 440ms);
  }
}
</style>
