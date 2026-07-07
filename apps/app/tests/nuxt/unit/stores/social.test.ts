// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Unit tests for useSocialStore.
 *
 * Covers: followingIds computed, follow/unfollow optimistic state,
 * feed population, and fetch error handling.
 */

import { setActivePinia, createPinia } from "pinia";
import {
  mockFeed,
  mockFollowers,
  mockFollowing,
  mockSocialProfile,
} from "../../fixtures/wellness";

describe("useSocialStore — computed selectors", () => {
  let store: ReturnType<typeof useSocialStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useSocialStore();
  });

  // ── followingIds ─────────────────────────────────────────────────────────────

  it("followingIds returns a Set of followee IDs", () => {
    store.following = mockFollowing;
    expect(store.followingIds.has("user-3")).toBe(true);
    expect(store.followingIds.has("user-99")).toBe(false);
  });

  it("followingIds is empty when following is empty", () => {
    store.following = [];
    expect(store.followingIds.size).toBe(0);
  });

  it("followingIds reflects all followed users", () => {
    store.following = [
      { followeeId: "a", followedAt: "2026-01-01T00:00:00Z" },
      { followeeId: "b", followedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(store.followingIds.size).toBe(2);
    expect(store.followingIds.has("a")).toBe(true);
    expect(store.followingIds.has("b")).toBe(true);
  });
});

describe("useSocialStore — async actions", () => {
  let store: ReturnType<typeof useSocialStore>;

  const mockJsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useSocialStore();
  });

  // ── fetchProfile ──────────────────────────────────────────────────────────────

  it("fetchProfile populates profile on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(mockSocialProfile));
    await store.fetchProfile();
    expect(store.profile?.userId).toBe("user-42");
    expect(store.errorProfile).toBeNull();
    expect(store.loadingProfile).toBe(false);
  });

  it("fetchProfile sets errorProfile on failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Profile error"));
    await store.fetchProfile();
    expect(store.errorProfile).toBe("Profile error");
  });

  // ── fetchFeed ─────────────────────────────────────────────────────────────────

  it("fetchFeed populates feed array", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(mockFeed));
    await store.fetchFeed();
    expect(store.feed).toHaveLength(2);
    expect(store.feed[0]!.type).toBe("BadgeEarned");
    expect(store.errorFeed).toBeNull();
  });

  it("fetchFeed sets errorFeed on failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Feed error"));
    await store.fetchFeed();
    expect(store.errorFeed).toBe("Feed error");
  });

  // ── fetchFollowers / fetchFollowing ───────────────────────────────────────────

  it("fetchFollowers populates followers silently on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(mockFollowers));
    await store.fetchFollowers();
    expect(store.followers).toHaveLength(1);
  });

  it("fetchFollowers silently degrades on failure (no errorFollowers field)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network"));
    await expect(store.fetchFollowers()).resolves.not.toThrow();
    expect(store.followers).toHaveLength(0);
  });

  it("fetchFollowing populates following", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(mockFollowing));
    await store.fetchFollowing();
    expect(store.following).toHaveLength(1);
    expect(store.followingIds.has("user-3")).toBe(true);
  });

  // ── follow (optimistic + refresh) ────────────────────────────────────────────

  it("follow calls the API then refreshes the following list", async () => {
    const newEntry = { followeeId: "user-99", followedAt: new Date().toISOString() };
    // POST /v1/social/follow/:id → 204 No Content, then GET /v1/social/following → list
    // useApiFetch skips JSON parsing only for 204; 200 with null body causes SyntaxError.
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(mockJsonResponse([...mockFollowing, newEntry]));

    await store.follow("user-99");
    expect(store.following).toHaveLength(2);
    expect(store.followingIds.has("user-99")).toBe(true);
  });

  // ── unfollow (optimistic removal) ────────────────────────────────────────────

  it("unfollow removes the followee from the local list immediately", async () => {
    store.following = [...mockFollowing]; // starts with user-3
    // DELETE /v1/social/follow/:id → 204 No Content
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await store.unfollow("user-3");
    expect(store.following).toHaveLength(0);
    expect(store.followingIds.has("user-3")).toBe(false);
  });

  it("unfollow on an ID not in the list is a no-op", async () => {
    store.following = [...mockFollowing];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await store.unfollow("user-999");
    expect(store.following).toHaveLength(1);
  });

  // ── fetchAll ──────────────────────────────────────────────────────────────────

  it("fetchAll loads profile, followers, following and feed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse(mockSocialProfile))
      .mockResolvedValueOnce(mockJsonResponse(mockFollowers))
      .mockResolvedValueOnce(mockJsonResponse(mockFollowing))
      .mockResolvedValueOnce(mockJsonResponse(mockFeed));

    await store.fetchAll();

    expect(store.profile?.userId).toBe("user-42");
    expect(store.followers).toHaveLength(1);
    expect(store.following).toHaveLength(1);
    expect(store.feed).toHaveLength(2);
  });
});
