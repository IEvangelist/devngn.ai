import type { RequestContext } from "../context.js";
import type { Database, DatabaseRow } from "../lib/database.js";
import {
  DEFAULT_GAP_OPTIONS,
  detectGaps,
  isValidTimeZone,
  type BusyInterval,
} from "../lib/gaps.js";
import { json, noContent, problem, validationProblem } from "../lib/http.js";
import {
  isFiniteNumber,
  isObject,
  isString,
  parseJsonObject,
  stringArrayValue,
} from "../lib/json.js";
import { awardPromptGamification } from "./gamification.js";
import {
  DELIVERY_CHANNELS,
  INTENSITY_LEVELS,
  isUuid,
  parseDateTime,
  stringFromRow,
} from "./shared.js";

interface ActivityCandidate {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly bodyArea: string;
  readonly intensity: string;
  readonly durationSeconds: number;
  readonly equipmentTags: readonly string[];
  readonly animationProvider: string;
  readonly animationAssetId: string;
  readonly licenseAttribution: unknown;
  readonly steps: unknown;
}

interface ProfilePreference {
  readonly fitnessBaseline: string;
  readonly preferredIntensity: string;
}

const ACTIVITY_JSON = `json_build_object(
  'id', id::text,
  'slug', slug,
  'title', title,
  'description', description,
  'bodyArea', body_area,
  'intensity', intensity,
  'durationSeconds', duration_seconds,
  'equipmentTags', equipment_tags,
  'animationProvider', animation_provider,
  'animationAssetId', animation_asset_id,
  'licenseAttribution', license_attribution,
  'steps', steps
)`;

const PROMPT_JSON = `json_build_object(
  'id', p.id::text,
  'activityId', a.id::text,
  'activitySlug', a.slug,
  'activityTitle', a.title,
  'activityDescription', a.description,
  'bodyArea', a.body_area,
  'intensity', a.intensity,
  'durationSeconds', a.duration_seconds,
  'equipmentTags', a.equipment_tags,
  'animationProvider', a.animation_provider,
  'animationAssetId', a.animation_asset_id,
  'licenseAttribution', a.license_attribution,
  'steps', a.steps,
  'gapStartUtc', p.gap_start_utc,
  'gapEndUtc', p.gap_end_utc,
  'deliveredAt', p.delivered_at,
  'deliveredVia', p.delivered_via,
  'dismissedAt', p.dismissed_at,
  'completedAt', p.completed_at,
  'feedbackRating', p.feedback_rating
)`;

function parseCandidate(value: unknown): ActivityCandidate | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const id = value.id;
  const slug = value.slug;
  const title = value.title;
  const description = value.description;
  const bodyArea = value.bodyArea;
  const intensity = value.intensity;
  const durationSeconds = value.durationSeconds;
  const equipmentTags = stringArrayValue(value, "equipmentTags");
  const animationProvider = value.animationProvider;
  const animationAssetId = value.animationAssetId;
  if (
    !isString(id) ||
    !isString(slug) ||
    !isString(title) ||
    !isString(description) ||
    !isString(bodyArea) ||
    !isString(intensity) ||
    !isFiniteNumber(durationSeconds) ||
    equipmentTags === undefined ||
    !isString(animationProvider) ||
    !isString(animationAssetId)
  ) {
    return undefined;
  }
  return {
    id,
    slug,
    title,
    description,
    bodyArea,
    intensity,
    durationSeconds,
    equipmentTags,
    animationProvider,
    animationAssetId,
    licenseAttribution: value.licenseAttribution ?? null,
    steps: value.steps ?? [],
  };
}

function parseProfilePreference(value: unknown): ProfilePreference | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const fitnessBaseline = value.fitnessBaseline;
  const preferredIntensity = value.preferredIntensity;
  return isString(fitnessBaseline) && isString(preferredIntensity)
    ? { fitnessBaseline, preferredIntensity }
    : undefined;
}

function parseDateFromRow(row: DatabaseRow, field: string): Date | undefined {
  const value = row[field];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return isString(value) ? parseDateTime(value) : undefined;
}

function parseChannel(value: string | null): string | undefined {
  if (value === null || value.length === 0) {
    return "Web";
  }
  return DELIVERY_CHANNELS.find(
    (candidate) => candidate.toLowerCase() === value.toLowerCase(),
  );
}

function activityScore(
  activity: ActivityCandidate,
  profile: ProfilePreference | undefined,
  goals: ReadonlySet<string>,
  equipment: ReadonlySet<string>,
  recentActivityIds: ReadonlySet<string>,
  policies: ReadonlyMap<
    string,
    { readonly weekly: number; readonly minMinutes: number }
  >,
  deliveryCounts: ReadonlyMap<string, number>,
): number {
  let score = 0;
  if (profile !== undefined) {
    const intensityIndex = INTENSITY_LEVELS.findIndex(
      (level) => level === activity.intensity,
    );
    const preferenceIndex = INTENSITY_LEVELS.findIndex(
      (level) => level === profile.preferredIntensity,
    );
    const difference = Math.abs(intensityIndex - preferenceIndex);
    if (difference === 0) score += 4;
    if (difference === 1) score += 2;
    if (
      profile.fitnessBaseline === "Sedentary" &&
      activity.intensity === "High"
    ) {
      score -= 3;
    }
  }
  if (alignsWithGoal(activity.bodyArea, goals)) {
    score += 3;
  }
  if (!recentActivityIds.has(activity.id)) {
    score += 1;
  }
  if (activity.equipmentTags.length > 0) {
    score += 2;
    for (const tag of activity.equipmentTags) {
      if (!equipment.has(tag)) {
        return Number.NEGATIVE_INFINITY;
      }
      const policy = policies.get(tag);
      if (policy !== undefined) {
        if ((deliveryCounts.get(tag) ?? 0) < policy.weekly) score += 6;
        if (
          policy.minMinutes > 0 &&
          activity.durationSeconds >= policy.minMinutes * 60
        ) {
          score += 3;
        }
      }
    }
  }
  return score;
}

function alignsWithGoal(bodyArea: string, goals: ReadonlySet<string>): boolean {
  const affinity: Readonly<Record<string, readonly string[]>> = {
    Mobility: ["Full", "Neck", "Back", "Wrists", "Hips", "Ankles"],
    Strength: ["Upper", "Lower", "Core", "Full"],
    Breathing: ["Breath"],
    Posture: ["Posture", "Back", "Neck"],
    CardioLight: ["Full", "Lower"],
  };
  for (const goal of goals) {
    if (affinity[goal]?.includes(bodyArea) === true) {
      return true;
    }
  }
  return false;
}

function chooseActivity(
  activities: readonly ActivityCandidate[],
  gapSeconds: number,
  profile: ProfilePreference | undefined,
  goals: ReadonlySet<string>,
  equipment: ReadonlySet<string>,
  recentActivityIds: ReadonlySet<string>,
  policies: ReadonlyMap<
    string,
    { readonly weekly: number; readonly minMinutes: number }
  >,
  deliveryCounts: ReadonlyMap<string, number>,
): ActivityCandidate | undefined {
  return activities
    .filter((activity) => activity.durationSeconds <= gapSeconds)
    .filter((activity) =>
      activity.equipmentTags.every((tag) => equipment.has(tag)),
    )
    .map((activity) => ({
      activity,
      score: activityScore(
        activity,
        profile,
        goals,
        equipment,
        recentActivityIds,
        policies,
        deliveryCounts,
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.activity.durationSeconds - right.activity.durationSeconds ||
        left.activity.slug.localeCompare(right.activity.slug),
    )[0]?.activity;
}

async function loadPrompt(
  database: Database,
  promptId: string,
  userId: string,
): Promise<unknown | undefined> {
  const rows = await database.query(
    `SELECT ${PROMPT_JSON} AS result
       FROM prompts p
       JOIN activities a ON a.id = p.activity_id
      WHERE p.id = $1::uuid AND p.user_id = $2::uuid`,
    [promptId, userId],
  );
  return rows[0]?.result;
}

async function generateNext(
  context: RequestContext,
  channel: string,
  timeZone: string,
  requestId: string | undefined,
): Promise<unknown | undefined> {
  const userId = context.userId;
  if (userId === null) {
    return undefined;
  }
  let createdPromptId: string | undefined;
  const result = await context.database().transaction(async (database) => {
    // The advisory lock gives POST /next requests and polling clients one
    // per-user serialization point without retaining any state in the function.
    await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      userId,
    ]);
    const consentRows = await database.query(
      "SELECT 1 AS present FROM consent_records WHERE user_id = $1::uuid",
      [userId],
    );
    if (consentRows.length === 0) {
      return undefined;
    }
    if (requestId !== undefined) {
      const existingRows = await database.query(
        `SELECT id::text AS id
           FROM prompts
          WHERE user_id = $1::uuid AND request_id = $2::uuid`,
        [userId, requestId],
      );
      const existingPromptId = stringFromRow(existingRows[0], "id");
      if (existingPromptId !== undefined) {
        return loadPrompt(database, existingPromptId, userId);
      }
    }
    const now = context.now();
    const windowEnd = new Date(now.getTime() + 240 * 60_000);
    const [busyRows, deliveryRows] = await Promise.all([
      database.query(
        `SELECT e.start_utc, e.end_utc
           FROM schedule_events e
           JOIN schedule_sources s ON s.id = e.source_id AND s.user_id = e.user_id
          WHERE e.user_id = $1::uuid
            AND e.busy
            AND s.connection_status <> 'Disabled'
            AND e.end_utc > $2::timestamptz
            AND e.start_utc < $3::timestamptz`,
        [userId, now.toISOString(), windowEnd.toISOString()],
      ),
      database.query(
        `SELECT delivered_at
           FROM prompts
          WHERE user_id = $1::uuid
            AND delivered_at >= $2::timestamptz
            AND delivered_at <= $3::timestamptz
          ORDER BY delivered_at`,
        [
          userId,
          new Date(
            now.getTime() - DEFAULT_GAP_OPTIONS.cooldownMinutes * 60_000,
          ).toISOString(),
          now.toISOString(),
        ],
      ),
    ]);
    const busy: BusyInterval[] = busyRows.flatMap((row) => {
      const start = parseDateFromRow(row, "start_utc");
      const end = parseDateFromRow(row, "end_utc");
      return start === undefined || end === undefined ? [] : [{ start, end }];
    });
    const deliveries = deliveryRows.flatMap((row) => {
      const deliveredAt = parseDateFromRow(row, "delivered_at");
      return deliveredAt === undefined ? [] : [deliveredAt];
    });
    const activeGap = detectGaps(
      busy,
      now,
      windowEnd,
      deliveries,
      timeZone,
      DEFAULT_GAP_OPTIONS,
      now,
    ).find((gap) => gap.start.getTime() <= now.getTime());
    if (activeGap === undefined) {
      return undefined;
    }
    const gapSeconds = Math.floor(
      (activeGap.end.getTime() - activeGap.start.getTime()) / 1000,
    );
    if (gapSeconds <= 0) {
      return undefined;
    }

    const [
      activityRows,
      profileRows,
      goalRows,
      equipmentRows,
      recentActivityRows,
      policyRows,
      deliveryCountRows,
    ] = await Promise.all([
      database.query(
        `SELECT ${ACTIVITY_JSON} AS result FROM activities ORDER BY duration_seconds, slug`,
      ),
      database.query(
        `SELECT json_build_object(
           'fitnessBaseline', fitness_baseline,
           'preferredIntensity', preferred_intensity
         ) AS result
         FROM profiles WHERE user_id = $1::uuid`,
        [userId],
      ),
      database.query("SELECT category FROM goals WHERE user_id = $1::uuid", [
        userId,
      ]),
      database.query("SELECT tag FROM equipment WHERE user_id = $1::uuid", [
        userId,
      ]),
      database.query(
        `SELECT activity_id::text AS activity_id
           FROM prompts
          WHERE user_id = $1::uuid
            AND delivered_at >= $2::timestamptz`,
        [userId, new Date(now.getTime() - 240 * 60_000).toISOString()],
      ),
      database.query(
        `SELECT tag, recommended_weekly_sessions, min_session_minutes
           FROM equipment_catalog`,
      ),
      database.query(
        `SELECT tag, COUNT(*)::integer AS count
           FROM prompts p
           JOIN activities a ON a.id = p.activity_id
           CROSS JOIN LATERAL unnest(a.equipment_tags) AS tag
          WHERE p.user_id = $1::uuid
            AND p.delivered_at >= $2::timestamptz
          GROUP BY tag`,
        [
          userId,
          new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ],
      ),
    ]);
    const activities = activityRows
      .map((row) => parseCandidate(row.result))
      .filter(
        (activity): activity is ActivityCandidate => activity !== undefined,
      );
    const profile = parseProfilePreference(profileRows[0]?.result);
    const goals = new Set(
      goalRows
        .map((row) => stringFromRow(row, "category"))
        .filter((category): category is string => category !== undefined),
    );
    const equipment = new Set(
      equipmentRows
        .map((row) => stringFromRow(row, "tag"))
        .filter((tag): tag is string => tag !== undefined)
        .map((tag) => tag.toLowerCase()),
    );
    const recentActivities = new Set(
      recentActivityRows
        .map((row) => stringFromRow(row, "activity_id"))
        .filter((id): id is string => id !== undefined),
    );
    const policies = new Map<
      string,
      { readonly weekly: number; readonly minMinutes: number }
    >();
    for (const policy of policyRows) {
      const tag = stringFromRow(policy, "tag");
      const weekly = policy.recommended_weekly_sessions;
      const minMinutes = policy.min_session_minutes;
      if (
        tag !== undefined &&
        typeof weekly === "number" &&
        Number.isInteger(weekly) &&
        weekly > 0
      ) {
        policies.set(tag, {
          weekly,
          minMinutes:
            typeof minMinutes === "number" && Number.isInteger(minMinutes)
              ? minMinutes
              : 0,
        });
      }
    }
    const deliveryCounts = new Map<string, number>();
    for (const count of deliveryCountRows) {
      const tag = stringFromRow(count, "tag");
      const value = count.count;
      if (
        tag !== undefined &&
        typeof value === "number" &&
        Number.isInteger(value)
      ) {
        deliveryCounts.set(tag, value);
      }
    }
    const activity = chooseActivity(
      activities,
      gapSeconds,
      profile,
      goals,
      equipment,
      recentActivities,
      policies,
      deliveryCounts,
    );
    if (activity === undefined) {
      return undefined;
    }
    const promptRows = await database.query(
      `INSERT INTO prompts
         (user_id, request_id, activity_id, gap_start_utc, gap_end_utc, delivered_at, delivered_via)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, now(), $6)
       RETURNING id::text AS id`,
      [
        userId,
        requestId ?? null,
        activity.id,
        activeGap.start.toISOString(),
        activeGap.end.toISOString(),
        channel,
      ],
    );
    const promptId = stringFromRow(promptRows[0], "id");
    if (promptId === undefined) {
      throw new Error("Prompt insert returned an invalid database row.");
    }
    createdPromptId = promptId;
    return loadPrompt(database, promptId, userId);
  });
  if (createdPromptId !== undefined) {
    try {
      await context.database().transaction(async (database) => {
        await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          userId,
        ]);
        await awardPromptGamification(database, userId, context.now());
      });
    } catch (error: unknown) {
      console.warn(
        "Prompt was delivered, but gamification update failed.",
        error,
      );
    }
  }
  return result;
}

export async function listPrompts(context: RequestContext): Promise<Response> {
  const rawLimit = context.url.searchParams.get("limit");
  const requested =
    rawLimit === null ? undefined : Number.parseInt(rawLimit, 10);
  const limit =
    requested === undefined ||
    !Number.isSafeInteger(requested) ||
    requested <= 0
      ? 50
      : Math.min(requested, 100);
  const rows = await context.database().query(
    `SELECT ${PROMPT_JSON} AS result
       FROM prompts p
       JOIN activities a ON a.id = p.activity_id
      WHERE p.user_id = $1::uuid
      ORDER BY p.delivered_at DESC, p.id DESC
      LIMIT $2`,
    [context.userId, limit],
  );
  return json(rows.map((row) => row.result));
}

export async function nextPrompt(context: RequestContext): Promise<Response> {
  const timeZone = context.url.searchParams.get("tz") ?? "UTC";
  if (!isValidTimeZone(timeZone)) {
    return validationProblem({
      tz: [
        `Unknown or invalid time zone '${timeZone}'. Use an IANA name (e.g. 'America/New_York') or omit for UTC.`,
      ],
    });
  }
  const channel = parseChannel(context.url.searchParams.get("channel"));
  if (channel === undefined) {
    return validationProblem({
      channel: [
        `Unknown channel '${context.url.searchParams.get("channel")}'. Valid values: vscode, cli, web, app.`,
      ],
    });
  }
  const requestIdHeader = context.request.headers.get("Idempotency-Key");
  const requestId =
    requestIdHeader === null ? undefined : requestIdHeader.trim();
  if (
    requestIdHeader !== null &&
    (requestId === undefined || !isUuid(requestId))
  ) {
    return validationProblem({
      idempotencyKey: ["Idempotency-Key must be a UUID."],
    });
  }
  const prompt = await generateNext(context, channel, timeZone, requestId);
  return prompt === undefined
    ? noContent(204, { "Retry-After": "900" })
    : json(prompt, 200, { "Retry-After": "900" });
}

async function lifecycle(
  context: RequestContext,
  column: "dismissed_at" | "completed_at",
): Promise<Response> {
  const rows = await context.database().query(
    `UPDATE prompts
        SET ${column} = COALESCE(${column}, now())
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id::text AS id`,
    [context.params.id, context.userId],
  );
  const id = stringFromRow(rows[0], "id");
  if (id === undefined || context.userId === null) {
    return problem(404, "Not Found", "Prompt not found.");
  }
  const prompt = await loadPrompt(context.database(), id, context.userId);
  return prompt === undefined
    ? problem(404, "Not Found", "Prompt not found.")
    : json(prompt);
}

export async function dismissPrompt(
  context: RequestContext,
): Promise<Response> {
  return lifecycle(context, "dismissed_at");
}

export async function completePrompt(
  context: RequestContext,
): Promise<Response> {
  return lifecycle(context, "completed_at");
}

export async function submitPromptFeedback(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  const rating = body?.rating;
  if (
    !isFiniteNumber(rating) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return validationProblem({ rating: ["Rating must be between 1 and 5."] });
  }
  const rows = await context.database().query(
    `UPDATE prompts
        SET feedback_rating = $3::smallint
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id::text AS id`,
    [context.params.id, context.userId, rating],
  );
  const id = stringFromRow(rows[0], "id");
  if (id === undefined || context.userId === null) {
    return problem(404, "Not Found", "Prompt not found.");
  }
  const prompt = await loadPrompt(context.database(), id, context.userId);
  return prompt === undefined
    ? problem(404, "Not Found", "Prompt not found.")
    : json(prompt);
}

export async function unsupportedPromptTransport(
  _context: RequestContext,
): Promise<Response> {
  // Netlify Functions cannot safely hold persistent SSE or WebSocket connections.
  // Clients retain contract-compatible prompt delivery by polling POST /v1/prompts/next.
  return problem(
    501,
    "Unsupported transport",
    "Persistent prompt streams are unavailable on Netlify Functions. Poll POST /v1/prompts/next instead.",
  );
}
