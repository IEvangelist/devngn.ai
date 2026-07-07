<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  TODO(wave2): bind social feed to /v1/social/feed, follow/unfollow to /v1/social/follows
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("social.title") }}</h1>

    <div class="social-layout">
      <!-- Feed -->
      <div class="social-feed">
        <h2 class="section-label">{{ $t("social.feed") }}</h2>
        <div class="feed-list">
          <article
            v-for="post in socialFeed"
            :key="post.id"
            class="post-card brut-card"
          >
            <header class="post-card__header">
              <BrutAvatar :src="post.avatarUrl" :alt="post.displayName" />
              <div>
                <strong>{{ post.login }}</strong>
                <span class="post-card__time brut-eyebrow">
                  {{ formatRelative(post.createdAt) }}
                </span>
              </div>
              <BrutChip v-if="post.badgeIcon" class="post-card__badge-icon">
                {{ post.badgeIcon }}
              </BrutChip>
            </header>
            <p class="post-card__content">{{ post.content }}</p>
            <footer class="post-card__footer">
              <button
                type="button"
                class="brut-btn brut-btn--ghost brut-btn--sm like-btn"
                :class="{ 'like-btn--liked': post.liked }"
                :aria-label="`Like: ${post.likeCount} likes`"
                :aria-pressed="post.liked"
                @click="gamification.likePost(post.id)"
              >
                <span aria-hidden="true">{{ post.liked ? "❤" : "♡" }}</span>
                {{ post.likeCount }}
              </button>
            </footer>
          </article>
        </div>
        <p class="brut-eyebrow social__note">
          <!-- TODO(wave2): bind to /v1/social/feed -->
          Preview data — live feed available in Wave 2
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// TODO(wave2): Replace mock data with real API calls to /v1/social/feed, /v1/social/follows
const gamification = useGamificationStore();
const { socialFeed } = storeToRefs(gamification);

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
</script>

<style scoped>
.social-layout { display: grid; gap: 1.5rem; margin-top: 1rem; }
.section-label {
  font-size: 0.85rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.feed-list { display: flex; flex-direction: column; gap: 1rem; }
.post-card__header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.65rem;
}
.post-card__time { display: block; }
.post-card__badge-icon { margin-left: auto; }
.post-card__content { margin: 0 0 0.65rem; line-height: 1.5; }
.post-card__footer { display: flex; gap: 0.5rem; }
.like-btn { color: var(--muted); }
.like-btn--liked { color: var(--accent-5); border-color: var(--accent-5); }
.social__note { margin-top: 0.75rem; color: var(--muted); }
</style>
