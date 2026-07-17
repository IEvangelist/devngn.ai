import type { RequestContext } from "../context.js";
import type { Database, DatabaseRow } from "../lib/database.js";
import { json } from "../lib/http.js";
import { isString } from "../lib/json.js";
import { stringFromRow } from "./shared.js";

export function xpRequiredForLevel(level: number): number {
  return level <= 1 ? 0 : 50 * level * (level - 1);
}

export function computeLevel(totalXp: number): number {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

export function rankTier(level: number): string {
  if (level <= 4) return "Bronze";
  if (level <= 9) return "Silver";
  if (level <= 14) return "Gold";
  if (level <= 19) return "Platinum";
  if (level <= 24) return "Diamond";
  return "Legend";
}

interface PlayerStateRow extends DatabaseRow {
  readonly total_xp?: unknown;
  readonly level?: unknown;
  readonly current_streak?: unknown;
  readonly longest_streak?: unknown;
  readonly last_activity_on?: unknown;
}

function integerRowValue(
  row: DatabaseRow | undefined,
  field: string,
): number | undefined {
  const value = row?.[field];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (isString(value)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanRowValue(row: DatabaseRow | undefined, field: string): boolean {
  return row?.[field] === true;
}

async function ensurePlayerState(
  database: Database,
  userId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO player_states
       (user_id, total_xp, level, current_streak, longest_streak, rank_tier)
     VALUES ($1::uuid, 0, 1, 0, 0, 'Bronze')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function addFeedItem(
  database: Database,
  userId: string,
  type: string,
  message: string,
): Promise<void> {
  await database.query(
    `INSERT INTO activity_feed_items (user_id, type, message, created_at)
     VALUES ($1::uuid, $2, $3, now())`,
    [userId, type, message],
  );
}

async function evaluateBadgesAndMilestones(
  database: Database,
  userId: string,
  totalXp: number,
  level: number,
  longestStreak: number,
): Promise<void> {
  const [
    badgeRows,
    existingBadgeRows,
    promptRows,
    goalRows,
    followRows,
    nightOwlRows,
    xpRows,
  ] = await Promise.all([
    database.query(
      `SELECT key, name, xp_threshold
           FROM badge_definitions
          ORDER BY key`,
    ),
    database.query(
      "SELECT badge_key FROM user_badges WHERE user_id = $1::uuid",
      [userId],
    ),
    database.query(
      "SELECT COUNT(*)::integer AS count FROM prompts WHERE user_id = $1::uuid",
      [userId],
    ),
    database.query(
      "SELECT COUNT(*)::integer AS count FROM goals WHERE user_id = $1::uuid",
      [userId],
    ),
    database.query(
      "SELECT COUNT(*)::integer AS count FROM follows WHERE follower_id = $1::uuid",
      [userId],
    ),
    database.query(
      `SELECT EXISTS (
           SELECT 1
             FROM prompts
            WHERE user_id = $1::uuid
              AND delivered_at >= now() - interval '90 days'
              AND (
                EXTRACT(HOUR FROM delivered_at AT TIME ZONE 'UTC') >= 22 OR
                EXTRACT(HOUR FROM delivered_at AT TIME ZONE 'UTC') < 2
              )
         ) AS eligible`,
      [userId],
    ),
    database.query(
      `SELECT created_at
           FROM xp_events
          WHERE user_id = $1::uuid
          ORDER BY created_at`,
      [userId],
    ),
  ]);
  const earned = new Set(
    existingBadgeRows
      .map((row) => stringFromRow(row, "badge_key"))
      .filter((key): key is string => key !== undefined),
  );
  const promptCount = integerRowValue(promptRows[0], "count") ?? 0;
  const goalCount = integerRowValue(goalRows[0], "count") ?? 0;
  const followCount = integerRowValue(followRows[0], "count") ?? 0;
  const nightOwl = booleanRowValue(nightOwlRows[0], "eligible");
  const xpDates = xpRows
    .map((row) => {
      const value = row.created_at;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }
      return isString(value) ? new Date(value) : undefined;
    })
    .filter(
      (value): value is Date =>
        value !== undefined && !Number.isNaN(value.getTime()),
    );
  const comeback = xpDates.some(
    (value, index) =>
      index > 0 &&
      index < xpDates.length - 1 &&
      value.getTime() - xpDates[index - 1]!.getTime() >=
        3 * 24 * 60 * 60 * 1000,
  );

  for (const badge of badgeRows) {
    const key = stringFromRow(badge, "key");
    const name = stringFromRow(badge, "name");
    if (key === undefined || name === undefined || earned.has(key)) {
      continue;
    }
    const xpThreshold = integerRowValue(badge, "xp_threshold") ?? 0;
    const unlocked = badgeUnlocked(
      key,
      totalXp,
      level,
      longestStreak,
      promptCount,
      goalCount,
      xpThreshold,
      nightOwl,
      comeback,
    );
    if (!unlocked) {
      continue;
    }
    const inserted = await database.query(
      `INSERT INTO user_badges (user_id, badge_key, earned_at)
       VALUES ($1::uuid, $2, now())
       ON CONFLICT (user_id, badge_key) DO NOTHING
       RETURNING badge_key`,
      [userId, key],
    );
    if (inserted.length > 0) {
      await addFeedItem(
        database,
        userId,
        "BadgeEarned",
        `Badge unlocked: ${name}!`,
      );
      earned.add(key);
    }
  }

  const [milestoneRows, existingMilestoneRows] = await Promise.all([
    database.query("SELECT key, name FROM milestone_definitions ORDER BY key"),
    database.query(
      "SELECT milestone_key FROM user_milestones WHERE user_id = $1::uuid",
      [userId],
    ),
  ]);
  const achieved = new Set(
    existingMilestoneRows
      .map((row) => stringFromRow(row, "milestone_key"))
      .filter((key): key is string => key !== undefined),
  );
  for (const milestone of milestoneRows) {
    const key = stringFromRow(milestone, "key");
    const name = stringFromRow(milestone, "name");
    if (key === undefined || name === undefined || achieved.has(key)) {
      continue;
    }
    if (!milestoneUnlocked(key, promptCount, longestStreak, followCount)) {
      continue;
    }
    const inserted = await database.query(
      `INSERT INTO user_milestones (user_id, milestone_key, achieved_at)
       VALUES ($1::uuid, $2, now())
       ON CONFLICT (user_id, milestone_key) DO NOTHING
       RETURNING milestone_key`,
      [userId, key],
    );
    if (inserted.length > 0) {
      await addFeedItem(
        database,
        userId,
        "MilestoneAchieved",
        `Milestone achieved: ${name}!`,
      );
      achieved.add(key);
    }
  }
}

function badgeUnlocked(
  key: string,
  totalXp: number,
  level: number,
  longestStreak: number,
  promptCount: number,
  goalCount: number,
  xpThreshold: number,
  nightOwl: boolean,
  comeback: boolean,
): boolean {
  switch (key) {
    case "first-steps":
      return promptCount >= 1;
    case "centurion":
      return totalXp >= 100;
    case "five-hundred":
      return totalXp >= 500;
    case "legend-status":
      return totalXp >= 5000;
    case "goal-setter":
      return goalCount >= 3;
    case "bronze-achiever":
      return level >= 1;
    case "silver-achiever":
      return level >= 5;
    case "gold-achiever":
      return level >= 10;
    case "seven-day-streak":
      return longestStreak >= 7;
    case "thirty-day-streak":
      return longestStreak >= 30;
    case "night-owl":
      return nightOwl;
    case "comeback-streak":
      return comeback;
    default:
      return xpThreshold > 0 && totalXp >= xpThreshold;
  }
}

function milestoneUnlocked(
  key: string,
  promptCount: number,
  longestStreak: number,
  followCount: number,
): boolean {
  switch (key) {
    case "first-prompt":
      return promptCount >= 1;
    case "ten-prompts":
      return promptCount >= 10;
    case "fifty-prompts":
      return promptCount >= 50;
    case "hundred-prompts":
      return promptCount >= 100;
    case "first-week":
      return longestStreak >= 7;
    case "social-butterfly":
      return followCount >= 5;
    case "hidden-marathon":
      return promptCount >= 1000;
    default:
      return false;
  }
}

/**
 * Awards the v1 prompt-delivery XP and updates all derived gamification rows.
 * Callers already hold a per-user transaction/advisory lock.
 */
export async function awardPromptGamification(
  database: Database,
  userId: string,
  now: Date,
): Promise<void> {
  await ensurePlayerState(database, userId);
  const beforeRows = await database.query<PlayerStateRow>(
    `SELECT total_xp, level, current_streak, longest_streak, last_activity_on
       FROM player_states
      WHERE user_id = $1::uuid
      FOR UPDATE`,
    [userId],
  );
  const before = beforeRows[0];
  const previousLevel = integerRowValue(before, "level") ?? 1;
  let totalXp = integerRowValue(before, "total_xp") ?? 0;
  let currentStreak = integerRowValue(before, "current_streak") ?? 0;
  let longestStreak = integerRowValue(before, "longest_streak") ?? 0;
  const lastActivity = stringFromRow(before, "last_activity_on");
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  totalXp += 10;
  if (lastActivity !== today) {
    currentStreak = lastActivity === yesterday ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
  }
  if (lastActivity !== today && currentStreak > 0 && currentStreak % 7 === 0) {
    totalXp += 50;
    await database.query(
      `INSERT INTO xp_events (user_id, amount, reason, created_at)
       VALUES ($1::uuid, 50, 'StreakBonus', now())`,
      [userId],
    );
  }
  const level = computeLevel(totalXp);
  await database.query(
    `UPDATE player_states
        SET total_xp = $2,
            level = $3,
            current_streak = $4,
            longest_streak = $5,
            last_activity_on = $6::date,
            rank_tier = $7
      WHERE user_id = $1::uuid`,
    [
      userId,
      totalXp,
      level,
      currentStreak,
      longestStreak,
      today,
      rankTier(level),
    ],
  );
  await database.query(
    `INSERT INTO xp_events (user_id, amount, reason, created_at)
     VALUES ($1::uuid, 10, 'PromptCompleted', now())`,
    [userId],
  );
  if (level > previousLevel) {
    await addFeedItem(
      database,
      userId,
      "LevelUp",
      `You reached level ${level}!`,
    );
  }
  await evaluateBadgesAndMilestones(
    database,
    userId,
    totalXp,
    level,
    longestStreak,
  );
}

export async function getPlayerState(
  context: RequestContext,
): Promise<Response> {
  const userId = context.userId;
  if (userId === null) {
    return json({ error: "unauthorized" }, 401);
  }
  await ensurePlayerState(context.database(), userId);
  const rows = await context.database().query<PlayerStateRow>(
    `SELECT total_xp, level, current_streak, longest_streak, rank_tier
       FROM player_states
      WHERE user_id = $1::uuid`,
    [userId],
  );
  const state = rows[0];
  const totalXp = integerRowValue(state, "total_xp") ?? 0;
  const level = integerRowValue(state, "level") ?? 1;
  return json({
    level,
    totalXp,
    xpIntoLevel: totalXp - xpRequiredForLevel(level),
    xpForNextLevel: xpRequiredForLevel(level + 1) - xpRequiredForLevel(level),
    currentStreak: integerRowValue(state, "current_streak") ?? 0,
    longestStreak: integerRowValue(state, "longest_streak") ?? 0,
    rankTier: stringFromRow(state, "rank_tier") ?? rankTier(level),
  });
}

export async function listBadges(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'key', CASE WHEN b.is_hidden AND ub.badge_key IS NULL THEN b.key ELSE b.key END,
       'name', CASE WHEN b.is_hidden AND ub.badge_key IS NULL THEN '???' ELSE b.name END,
       'description', CASE
         WHEN b.is_hidden AND ub.badge_key IS NULL
         THEN 'Keep going — there''s something hidden here.'
         ELSE b.description
       END,
       'icon', CASE WHEN b.is_hidden AND ub.badge_key IS NULL THEN '🔒' ELSE b.icon END,
       'category', CASE WHEN b.is_hidden AND ub.badge_key IS NULL THEN 'hidden' ELSE b.category END,
       'isHidden', b.is_hidden,
       'earned', ub.badge_key IS NOT NULL,
       'earnedAt', ub.earned_at
     ) AS result
     FROM badge_definitions b
     LEFT JOIN user_badges ub
       ON ub.badge_key = b.key AND ub.user_id = $1::uuid
     ORDER BY b.key`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function listMilestones(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'key', CASE WHEN m.is_hidden AND um.milestone_key IS NULL THEN '???' ELSE m.key END,
       'name', CASE WHEN m.is_hidden AND um.milestone_key IS NULL THEN '???' ELSE m.name END,
       'description', CASE
         WHEN m.is_hidden AND um.milestone_key IS NULL
         THEN 'A hidden milestone awaits.'
         ELSE m.description
       END,
       'isHidden', m.is_hidden,
       'achieved', um.milestone_key IS NOT NULL,
       'achievedAt', um.achieved_at
     ) AS result
     FROM milestone_definitions m
     LEFT JOIN user_milestones um
       ON um.milestone_key = m.key AND um.user_id = $1::uuid
     ORDER BY m.key`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function getLeaderboard(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'userId', ps.user_id::text,
       'displayName', sp.display_name,
       'totalXp', ps.total_xp,
       'level', ps.level,
       'rankTier', ps.rank_tier
     ) AS result
     FROM player_states ps
     JOIN social_profiles sp ON sp.user_id = ps.user_id
     WHERE sp.is_public
     ORDER BY ps.total_xp DESC
     LIMIT 50`,
  );
  return json(rows.map((row) => row.result));
}
