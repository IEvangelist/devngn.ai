// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

// TODO(wave2): bind to /v1/gamification/* and /v1/social/* when the backend ships.
// Replace mock data with real API calls and remove local types.

import type {
  Badge,
  LeaderboardEntry,
  Milestone,
  SocialPost,
  UserLevel,
} from "~/types/gamification";

/** Mock badges for the UI scaffold. Wave2: fetch from /v1/gamification/badges */
const MOCK_BADGES: Badge[] = [
  {
    id: "b1",
    slug: "first-break",
    name: "First Break",
    description: "Complete your very first wellness interruption.",
    icon: "🌱",
    color: "var(--success)",
    earned: true,
    earnedAt: "2026-06-01T12:00:00Z",
    hidden: false,
    category: "wellness",
  },
  {
    id: "b2",
    slug: "week-warrior",
    name: "Week Warrior",
    description: "Complete interruptions 7 days in a row.",
    icon: "🔥",
    color: "var(--accent)",
    earned: true,
    earnedAt: "2026-06-08T12:00:00Z",
    hidden: false,
    category: "streak",
    progress: 7,
    maxProgress: 7,
  },
  {
    id: "b3",
    slug: "stretch-master",
    name: "Stretch Master",
    description: "Complete 50 stretching interruptions.",
    icon: "🧘",
    color: "var(--accent-2)",
    earned: false,
    hidden: false,
    category: "wellness",
    progress: 23,
    maxProgress: 50,
  },
  {
    id: "b4",
    slug: "social-butterfly",
    name: "Social Butterfly",
    description: "Follow 10 other developers.",
    icon: "🦋",
    color: "var(--accent-5)",
    earned: false,
    hidden: false,
    category: "social",
    progress: 4,
    maxProgress: 10,
  },
  {
    id: "b5",
    slug: "mystery-1",
    name: "???",
    description: "Keep up your streak to unlock this hidden badge.",
    icon: "❓",
    color: "var(--muted)",
    earned: false,
    hidden: true,
    category: "special",
  },
  {
    id: "b6",
    slug: "month-legend",
    name: "Month Legend",
    description: "Complete interruptions 30 days in a row.",
    icon: "👑",
    color: "var(--accent-3)",
    earned: false,
    hidden: false,
    category: "streak",
    progress: 7,
    maxProgress: 30,
  },
];

const MOCK_MILESTONES: Milestone[] = [
  {
    id: "m1",
    title: "Hello, World!",
    description: "You completed your first wellness interruption.",
    revealed: true,
    completedAt: "2026-06-01T12:00:00Z",
    icon: "🌟",
    xpReward: 100,
  },
  {
    id: "m2",
    title: "A Week Well Done",
    description: "Seven consecutive days of healthy breaks.",
    revealed: true,
    completedAt: "2026-06-08T12:00:00Z",
    icon: "📅",
    xpReward: 250,
  },
  {
    id: "m3",
    title: "Social Debut",
    description: "You followed your first developer.",
    revealed: true,
    completedAt: undefined,
    icon: "🤝",
    xpReward: 50,
    requiredCount: 1,
    currentCount: 0,
  },
  {
    id: "m4",
    title: "Hidden Milestone",
    description: "Keep going to unlock this mystery achievement.",
    revealed: false,
    icon: "🔮",
    xpReward: 500,
  },
];

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    userId: "u1",
    login: "morpheus",
    displayName: "Morpheus",
    avatarUrl: "https://github.com/ghost.png",
    xp: 12450,
    level: 24,
    streak: 42,
  },
  {
    rank: 2,
    userId: "u2",
    login: "neo",
    displayName: "Neo",
    avatarUrl: "https://github.com/ghost.png",
    xp: 10320,
    level: 21,
    streak: 30,
    isCurrentUser: true,
  },
  {
    rank: 3,
    userId: "u3",
    login: "trinity",
    displayName: "Trinity",
    avatarUrl: "https://github.com/ghost.png",
    xp: 9870,
    level: 20,
    streak: 28,
  },
  {
    rank: 4,
    userId: "u4",
    login: "dozer",
    displayName: "Dozer",
    avatarUrl: "https://github.com/ghost.png",
    xp: 7640,
    level: 17,
    streak: 14,
  },
  {
    rank: 5,
    userId: "u5",
    login: "tank",
    displayName: "Tank",
    avatarUrl: "https://github.com/ghost.png",
    xp: 6200,
    level: 15,
    streak: 10,
  },
];

const MOCK_SOCIAL: SocialPost[] = [
  {
    id: "sp1",
    userId: "u1",
    login: "morpheus",
    displayName: "Morpheus",
    avatarUrl: "https://github.com/ghost.png",
    content: "Just earned the Week Warrior badge! 🔥 Seven days straight.",
    type: "badge",
    badgeIcon: "🔥",
    likeCount: 12,
    liked: false,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "sp2",
    userId: "u3",
    login: "trinity",
    displayName: "Trinity",
    avatarUrl: "https://github.com/ghost.png",
    content: "Hit a 28-day streak 💪 No stopping now.",
    type: "streak",
    likeCount: 8,
    liked: true,
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
];

const MOCK_LEVEL: UserLevel = {
  level: 21,
  xp: 10320,
  xpToNext: 12000,
  title: "Wellness Architect",
  streak: 30,
};

export const useGamificationStore = defineStore("gamification", () => {
  // TODO(wave2): Replace mock data with API calls once /v1/gamification/* endpoints exist.
  const userLevel = ref<UserLevel>({ ...MOCK_LEVEL });
  const badges = ref<Badge[]>([...MOCK_BADGES]);
  const milestones = ref<Milestone[]>([...MOCK_MILESTONES]);
  const leaderboard = ref<LeaderboardEntry[]>([...MOCK_LEADERBOARD]);
  const socialFeed = ref<SocialPost[]>([...MOCK_SOCIAL]);

  const earnedBadges = computed(() => badges.value.filter((b) => b.earned));
  const lockedBadges = computed(() => badges.value.filter((b) => !b.earned));
  const completedMilestones = computed(() =>
    milestones.value.filter((m) => !!m.completedAt),
  );
  const xpPercent = computed(() =>
    Math.min(100, Math.round((userLevel.value.xp / userLevel.value.xpToNext) * 100)),
  );

  function likePost(id: string): void {
    const post = socialFeed.value.find((p) => p.id === id);
    if (!post) return;
    post.liked = !post.liked;
    post.likeCount += post.liked ? 1 : -1;
  }

  return {
    userLevel,
    badges,
    milestones,
    leaderboard,
    socialFeed,
    earnedBadges,
    lockedBadges,
    completedMilestones,
    xpPercent,
    likePost,
  };
});
