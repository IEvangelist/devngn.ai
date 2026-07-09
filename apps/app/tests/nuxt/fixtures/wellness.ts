// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Typed mock data fixtures for unit and e2e tests.
 * Shapes exactly match the @devngn/wellness-types OpenAPI schema.
 */

import type { AuthenticatedUserResponse, PromptResponse } from "@devngn/wellness-types";
import type {
  BadgeResponse,
  LeaderboardEntry,
  MilestoneResponse,
  PlayerStateResponse,
  SocialProfileResponse,
  FeedItemResponse,
  FollowerResponse,
  FollowResponse,
} from "~/types/gamification";

// ── Auth ──────────────────────────────────────────────────────────────────────
// AuthenticatedUserResponse: {id, gitHubId, login, displayName, avatarUrl}

export const mockUser: AuthenticatedUserResponse = {
  id: "user-42",
  gitHubId: 12345678,
  login: "devngntest",
  displayName: "DevNgn Tester",
  avatarUrl: "https://example.com/avatar.png",
};

// ── Gamification ──────────────────────────────────────────────────────────────
// PlayerStateResponse: {level, totalXp, xpIntoLevel, xpForNextLevel, currentStreak, longestStreak, rankTier}

export const mockPlayerState: PlayerStateResponse = {
  level: 5,
  totalXp: 1250,
  xpIntoLevel: 250,
  xpForNextLevel: 500,
  currentStreak: 7,
  longestStreak: 14,
  rankTier: "Gold",
};

// BadgeResponse: {key, name, description, icon, category, isHidden, earned, earnedAt: null|string}

export const mockBadges: BadgeResponse[] = [
  {
    key: "streak-7",
    name: "Week Warrior",
    description: "Maintain a 7-day streak",
    icon: "🔥",
    category: "streak",
    earned: true,
    earnedAt: "2026-07-01T10:00:00Z",
    isHidden: false,
  },
  {
    key: "wellness-10",
    name: "Wellness Champion",
    description: "Complete 10 wellness activities",
    icon: "💪",
    category: "wellness",
    earned: true,
    earnedAt: "2026-07-03T14:00:00Z",
    isHidden: false,
  },
  {
    key: "social-first",
    name: "Social Butterfly",
    description: "Follow your first developer",
    icon: "🦋",
    category: "social",
    earned: false,
    earnedAt: null,
    isHidden: false,
  },
  {
    key: "mystery-1",
    name: "Hidden Badge",
    description: "???",
    icon: "❓",
    category: "special",
    earned: false,
    earnedAt: null,
    isHidden: true,
  },
];

// MilestoneResponse: {key, name, description, isHidden, achieved, achievedAt: null|string}

export const mockMilestones: MilestoneResponse[] = [
  {
    key: "first-login",
    name: "First Steps",
    description: "Log in to devngn for the first time",
    achieved: true,
    achievedAt: "2026-06-01T08:00:00Z",
    isHidden: false,
  },
  {
    key: "streak-30",
    name: "Month Maverick",
    description: "Maintain a 30-day streak",
    achieved: false,
    achievedAt: null,
    isHidden: false,
  },
  {
    key: "mystery-milestone",
    name: "Mystery Milestone",
    description: "Keep going to unlock this hidden milestone.",
    achieved: false,
    achievedAt: null,
    isHidden: true,
  },
];

// LeaderboardEntry: {userId, displayName, totalXp, level, rankTier}

export const mockLeaderboard: LeaderboardEntry[] = [
  {
    userId: "user-1",
    displayName: "AliceCode",
    level: 10,
    totalXp: 5000,
    rankTier: "Platinum",
  },
  {
    userId: "user-42",
    displayName: "devngntest",
    level: 5,
    totalXp: 1250,
    rankTier: "Gold",
  },
  {
    userId: "user-3",
    displayName: "BobDev",
    level: 3,
    totalXp: 600,
    rankTier: "Silver",
  },
];

// ── Social ────────────────────────────────────────────────────────────────────
// SocialProfileResponse: {userId, displayName, bio: null|string, isPublic}

export const mockSocialProfile: SocialProfileResponse = {
  userId: "user-42",
  displayName: "devngntest",
  bio: "Testing the devngn platform.",
  isPublic: true,
};

// FeedItemResponse: {id, type, message, createdAt}

export const mockFeed: FeedItemResponse[] = [
  {
    id: "feed-1",
    type: "BadgeEarned",
    message: "AliceCode earned the Week Warrior badge!",
    createdAt: "2026-07-06T09:00:00Z",
  },
  {
    id: "feed-2",
    type: "LevelUp",
    message: "BobDev leveled up to Level 4!",
    createdAt: "2026-07-05T15:30:00Z",
  },
];

export const mockFollowers: FollowerResponse[] = [
  { followerId: "user-1", followedAt: "2026-07-01T00:00:00Z" },
];

export const mockFollowing: FollowResponse[] = [
  { followeeId: "user-3", followedAt: "2026-07-02T00:00:00Z" },
];

// ── Wellness prompts ───────────────────────────────────────────────────────────
// PromptResponse: full schema with all required fields

export const mockPendingPrompt: PromptResponse = {
  id: "prompt-1",
  activityId: "activity-42",
  activitySlug: "standing-break",
  activityTitle: "Take a standing break",
  activityDescription: "Stand up and stretch for 2 minutes.",
  bodyArea: "Back",
  intensity: "Low",
  durationSeconds: 120,
  equipmentTags: [],
  steps: [],
  animationProvider: "lottie",
  animationAssetId: "standing-break.json",
  licenseAttribution: null,
  gapStartUtc: "2026-07-06T13:50:00Z",
  gapEndUtc: "2026-07-06T14:10:00Z",
  deliveredAt: "2026-07-06T14:00:00Z",
  deliveredVia: "Web",
  dismissedAt: null,
  completedAt: null,
  feedbackRating: null,
};

export const mockCompletedPrompt: PromptResponse = {
  ...mockPendingPrompt,
  id: "prompt-2",
  completedAt: "2026-07-06T14:05:00Z",
};

export const mockDismissedPrompt: PromptResponse = {
  ...mockPendingPrompt,
  id: "prompt-3",
  dismissedAt: "2026-07-06T14:02:00Z",
};


