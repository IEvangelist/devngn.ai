// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Local gamification types used by the mock Pinia store.
 * TODO(wave2): bind to /v1/gamification/* and /v1/social/* when the backend
 *              ships its generated @devngn/wellness-types exports.
 */

export interface UserLevel {
  level: number;
  xp: number;
  xpToNext: number;
  title: string;
  /** days of continuous interruption completions */
  streak: number;
}

export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** emoji or icon identifier */
  icon: string;
  /** CSS color token, e.g. "var(--accent)" */
  color: string;
  earned: boolean;
  earnedAt?: string;
  /** When true the badge art and name are hidden until earned */
  hidden: boolean;
  /** Current progress toward the badge (0–maxProgress) */
  progress?: number;
  maxProgress?: number;
  category: "wellness" | "social" | "streak" | "milestone" | "special";
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** Hidden milestones show a mystery reveal UI */
  revealed: boolean;
  completedAt?: string;
  icon: string;
  xpReward: number;
  requiredCount?: number;
  currentCount?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  xp: number;
  level: number;
  streak: number;
  isCurrentUser?: boolean;
}

export interface SocialPost {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  type: "badge" | "milestone" | "streak" | "goal" | "general";
  badgeIcon?: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
}

export interface FollowRelation {
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  following: boolean;
}
