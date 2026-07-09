// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  FeedItemResponse,
  FollowerResponse,
  FollowResponse,
  SocialProfileResponse,
  UpsertSocialProfileRequest,
} from "~/types/gamification";

export const useSocialStore = defineStore("social", () => {
  const apiFetch = useApiFetch();

  const profile = ref<SocialProfileResponse | null>(null);
  const followers = ref<FollowerResponse[]>([]);
  const following = ref<FollowResponse[]>([]);
  const feed = ref<FeedItemResponse[]>([]);

  const loadingProfile = ref(false);
  const loadingFeed = ref(false);
  const loadingFollowers = ref(false);
  const loadingFollowing = ref(false);

  const errorProfile = ref<string | null>(null);
  const errorFeed = ref<string | null>(null);

  const followingIds = computed(
    () => new Set(following.value.map((f: FollowResponse) => f.followeeId)),
  );

  async function fetchProfile(): Promise<void> {
    loadingProfile.value = true;
    errorProfile.value = null;
    try {
      profile.value = await apiFetch<SocialProfileResponse>("/v1/social/profile");
    } catch (e) {
      // A 404 just means the user has not created a social profile yet. Treat
      // that as an empty first-run state (show the edit form), not a failure.
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("404")) {
        profile.value = null;
      } else {
        errorProfile.value = msg || "Failed to load profile.";
      }
    } finally {
      loadingProfile.value = false;
    }
  }

  async function upsertProfile(req: UpsertSocialProfileRequest): Promise<void> {
    profile.value = await apiFetch<SocialProfileResponse>("/v1/social/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async function fetchFollowers(): Promise<void> {
    loadingFollowers.value = true;
    try {
      followers.value = await apiFetch<FollowerResponse[]>("/v1/social/followers");
    } catch {
      // silently degrade; count stays at 0
    } finally {
      loadingFollowers.value = false;
    }
  }

  async function fetchFollowing(): Promise<void> {
    loadingFollowing.value = true;
    try {
      following.value = await apiFetch<FollowResponse[]>("/v1/social/following");
    } catch {
      // silently degrade
    } finally {
      loadingFollowing.value = false;
    }
  }

  async function follow(followeeId: string): Promise<void> {
    await apiFetch(`/v1/social/follow/${followeeId}`, { method: "POST" });
    await fetchFollowing();
  }

  async function unfollow(followeeId: string): Promise<void> {
    await apiFetch(`/v1/social/follow/${followeeId}`, { method: "DELETE" });
    following.value = following.value.filter((f: FollowResponse) => f.followeeId !== followeeId);
  }

  async function fetchFeed(): Promise<void> {
    loadingFeed.value = true;
    errorFeed.value = null;
    try {
      feed.value = await apiFetch<FeedItemResponse[]>("/v1/social/feed");
    } catch (e) {
      errorFeed.value =
        e instanceof Error ? e.message : "Failed to load feed.";
    } finally {
      loadingFeed.value = false;
    }
  }

  async function fetchAll(): Promise<void> {
    await Promise.all([
      fetchProfile(),
      fetchFollowers(),
      fetchFollowing(),
      fetchFeed(),
    ]);
  }

  return {
    profile,
    followers,
    following,
    feed,
    loadingProfile,
    loadingFeed,
    loadingFollowers,
    loadingFollowing,
    errorProfile,
    errorFeed,
    followingIds,
    fetchProfile,
    upsertProfile,
    fetchFollowers,
    fetchFollowing,
    follow,
    unfollow,
    fetchFeed,
    fetchAll,
  };
});
