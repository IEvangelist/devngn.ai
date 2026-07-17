import type { RequestContext } from "../context.js";
import type { DatabaseRow } from "../lib/database.js";
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
} from "../lib/json.js";
import {
  BODY_AREAS,
  CONSENT_TEXT,
  CONSENT_VERSION,
  FITNESS_BASELINES,
  GOAL_CATEGORIES,
  INTENSITY_LEVELS,
  dateOnly,
  enumQueryValue,
  enumValue,
  optionalTrimmedString,
  parseDateTime,
  requiredTrimmedString,
} from "./shared.js";

function requiredBodyError(): Response {
  return validationProblem({ body: ["A JSON object is required."] });
}

function nullableInputString(
  body: Record<string, unknown>,
  name: string,
  maximumLength: number,
  errors: Record<string, string[]>,
): string | null {
  const value = body[name];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isString(value) || value.length > maximumLength) {
    errors[name] = [
      `${name} must be a string with at most ${maximumLength} characters.`,
    ];
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function nullableInputNumber(
  body: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
  errors: Record<string, string[]>,
): number | null {
  const value = body[name];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isFiniteNumber(value) || value < minimum || value > maximum) {
    errors[name] = [`${name} must be between ${minimum} and ${maximum}.`];
    return null;
  }
  return value;
}

function enumInput<T extends readonly string[]>(
  body: Record<string, unknown>,
  name: string,
  values: T,
  fallback: T[number],
  errors: Record<string, string[]>,
): T[number] {
  if (body[name] === undefined) {
    return fallback;
  }
  const value = enumValue(body, name, values);
  if (value === undefined) {
    errors[name] = [`${name} has an invalid value.`];
    return fallback;
  }
  return value;
}

export async function getConsent(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'accepted',
       CASE WHEN c.user_id IS NULL THEN NULL ELSE json_build_object(
         'version', c.version,
         'text', c.text,
         'acceptedAt', c.accepted_at
       ) END,
       'current', json_build_object('version', $2::text, 'text', $3::text)
     ) AS result
     FROM (SELECT $1::uuid AS user_id) input
     LEFT JOIN consent_records c ON c.user_id = input.user_id`,
    [context.userId, CONSENT_VERSION, CONSENT_TEXT],
  );
  return json(rows[0]?.result);
}

export async function acceptConsent(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const version = body.version;
  if (!isString(version) || version !== CONSENT_VERSION) {
    return validationProblem({
      version: [
        "Unknown consent version. Use GET /v1/consent to discover the current version.",
      ],
    });
  }
  const rows = await context.database().query(
    `INSERT INTO consent_records (user_id, version, text, accepted_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET version = EXCLUDED.version,
           text = EXCLUDED.text,
           accepted_at = CASE
             WHEN consent_records.version = EXCLUDED.version
             THEN consent_records.accepted_at
             ELSE EXCLUDED.accepted_at
           END
     RETURNING json_build_object(
       'version', version,
       'text', text,
       'acceptedAt', accepted_at
     ) AS result`,
    [context.userId, CONSENT_VERSION, CONSENT_TEXT],
  );
  return json(rows[0]?.result);
}

export async function revokeConsent(
  context: RequestContext,
): Promise<Response> {
  await context.database().transaction(async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      context.userId,
    ]);
    await database.query(
      "DELETE FROM consent_records WHERE user_id = $1::uuid",
      [context.userId],
    );
  });
  return noContent();
}

export async function getProfile(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'id', id::text,
       'ageRange', age_range,
       'heightCm', height_cm,
       'weightKg', weight_kg,
       'fitnessBaseline', fitness_baseline,
       'preferredIntensity', preferred_intensity,
       'limitations', limitations,
       'timeOfDayPreference', time_of_day_preference,
       'updatedAt', updated_at
     ) AS result
     FROM profiles WHERE user_id = $1::uuid`,
    [context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Profile not found.")
    : json(rows[0]?.result);
}

export async function upsertProfile(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const errors: Record<string, string[]> = {};
  const ageRange = nullableInputString(body, "ageRange", 20, errors);
  const heightCm = nullableInputNumber(body, "heightCm", 30, 300, errors);
  const weightKg = nullableInputNumber(body, "weightKg", 20, 500, errors);
  const fitnessBaseline = enumInput(
    body,
    "fitnessBaseline",
    FITNESS_BASELINES,
    "Unspecified",
    errors,
  );
  const preferredIntensity = enumInput(
    body,
    "preferredIntensity",
    INTENSITY_LEVELS,
    "Low",
    errors,
  );
  const limitations = nullableInputString(body, "limitations", 2000, errors);
  const timeOfDayPreference = nullableInputString(
    body,
    "timeOfDayPreference",
    100,
    errors,
  );
  if (Object.keys(errors).length > 0) {
    return validationProblem(errors);
  }
  const rows = await context.database().query(
    `INSERT INTO profiles
       (user_id, age_range, height_cm, weight_kg, fitness_baseline,
        preferred_intensity, limitations, time_of_day_preference, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (user_id) DO UPDATE
       SET age_range = EXCLUDED.age_range,
           height_cm = EXCLUDED.height_cm,
           weight_kg = EXCLUDED.weight_kg,
           fitness_baseline = EXCLUDED.fitness_baseline,
           preferred_intensity = EXCLUDED.preferred_intensity,
           limitations = EXCLUDED.limitations,
           time_of_day_preference = EXCLUDED.time_of_day_preference,
           updated_at = now()
     RETURNING json_build_object(
       'id', id::text,
       'ageRange', age_range,
       'heightCm', height_cm,
       'weightKg', weight_kg,
       'fitnessBaseline', fitness_baseline,
       'preferredIntensity', preferred_intensity,
       'limitations', limitations,
       'timeOfDayPreference', time_of_day_preference,
       'updatedAt', updated_at
     ) AS result`,
    [
      context.userId,
      ageRange,
      heightCm,
      weightKg,
      fitnessBaseline,
      preferredIntensity,
      limitations,
      timeOfDayPreference,
    ],
  );
  return json(rows[0]?.result);
}

export async function deleteProfile(
  context: RequestContext,
): Promise<Response> {
  const rows = await context
    .database()
    .query(
      "DELETE FROM profiles WHERE user_id = $1::uuid RETURNING id::text AS id",
      [context.userId],
    );
  return rows.length === 0
    ? problem(404, "Not Found", "Profile not found.")
    : noContent();
}

interface GoalInput {
  readonly title: string;
  readonly description: string | null;
  readonly category: string;
  readonly targetMetric: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
}

function parseGoalInput(body: Record<string, unknown>): GoalInput | Response {
  const errors: Record<string, string[]> = {};
  const title = requiredTrimmedString(body, "title", 120);
  if (title === undefined) {
    errors.title = ["Title is required and must not exceed 120 characters."];
  }
  const description = nullableInputString(body, "description", 2000, errors);
  const category = enumInput(
    body,
    "category",
    GOAL_CATEGORIES,
    "Mobility",
    errors,
  );
  const targetMetric = nullableInputString(body, "targetMetric", 80, errors);
  const rawStart = body.startDate;
  const startDate = isString(rawStart) ? dateOnly(rawStart) : undefined;
  if (startDate === undefined) {
    errors.startDate = ["StartDate is required and must be an ISO date."];
  }
  let endDate: string | null = null;
  if (body.endDate !== undefined && body.endDate !== null) {
    endDate = isString(body.endDate) ? (dateOnly(body.endDate) ?? null) : null;
    if (endDate === null) {
      errors.endDate = ["EndDate must be an ISO date."];
    }
  }
  if (startDate !== undefined && endDate !== null && endDate < startDate) {
    errors.endDate = ["EndDate must be on or after StartDate."];
  }
  if (
    Object.keys(errors).length > 0 ||
    title === undefined ||
    startDate === undefined
  ) {
    return validationProblem(errors);
  }
  return { title, description, category, targetMetric, startDate, endDate };
}

const GOAL_JSON = `json_build_object(
  'id', id::text,
  'title', title,
  'description', description,
  'category', category,
  'targetMetric', target_metric,
  'startDate', start_date,
  'endDate', end_date,
  'createdAt', created_at,
  'updatedAt', updated_at
)`;

export async function listGoals(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${GOAL_JSON} AS result
       FROM goals
      WHERE user_id = $1::uuid
      ORDER BY start_date, created_at`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function getGoal(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${GOAL_JSON} AS result
       FROM goals
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [context.params.id, context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Goal not found.")
    : json(rows[0]?.result);
}

export async function createGoal(context: RequestContext): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const input = parseGoalInput(body);
  if (input instanceof Response) {
    return input;
  }
  const rows = await context.database().query(
    `INSERT INTO goals
       (user_id, title, description, category, target_metric, start_date, end_date, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::date, $7::date, now(), now())
     RETURNING ${GOAL_JSON} AS result`,
    [
      context.userId,
      input.title,
      input.description,
      input.category,
      input.targetMetric,
      input.startDate,
      input.endDate,
    ],
  );
  const result = rows[0]?.result;
  const id = isObject(result) && isString(result.id) ? result.id : undefined;
  return json(
    result,
    201,
    id === undefined ? undefined : { Location: `/v1/goals/${id}` },
  );
}

export async function updateGoal(context: RequestContext): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const input = parseGoalInput(body);
  if (input instanceof Response) {
    return input;
  }
  const rows = await context.database().query(
    `UPDATE goals
        SET title = $3,
            description = $4,
            category = $5,
            target_metric = $6,
            start_date = $7::date,
            end_date = $8::date,
            updated_at = now()
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING ${GOAL_JSON} AS result`,
    [
      context.params.id,
      context.userId,
      input.title,
      input.description,
      input.category,
      input.targetMetric,
      input.startDate,
      input.endDate,
    ],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Goal not found.")
    : json(rows[0]?.result);
}

export async function deleteGoal(context: RequestContext): Promise<Response> {
  const rows = await context
    .database()
    .query(
      "DELETE FROM goals WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id::text AS id",
      [context.params.id, context.userId],
    );
  return rows.length === 0
    ? problem(404, "Not Found", "Goal not found.")
    : noContent();
}

const EQUIPMENT_JSON = `json_build_object(
  'id', id::text,
  'tag', tag,
  'displayName', display_name,
  'notes', notes,
  'createdAt', created_at
)`;

export async function listEquipmentCatalog(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'tag', tag,
       'displayName', display_name,
       'category', category,
       'description', description,
       'recommendedWeeklySessions', recommended_weekly_sessions,
       'minSessionMinutes', min_session_minutes
     ) AS result
     FROM equipment_catalog
     ORDER BY tag`,
  );
  return json(rows.map((row) => row.result));
}

export async function listEquipment(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${EQUIPMENT_JSON} AS result
       FROM equipment
      WHERE user_id = $1::uuid
      ORDER BY tag`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function getEquipment(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${EQUIPMENT_JSON} AS result
       FROM equipment
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [context.params.id, context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Equipment not found.")
    : json(rows[0]?.result);
}

function parseCreateEquipment(body: Record<string, unknown>):
  | {
      readonly tag: string;
      readonly displayName: string;
      readonly notes: string | null;
    }
  | Response {
  const errors: Record<string, string[]> = {};
  const tag = requiredTrimmedString(body, "tag", 60);
  if (tag === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(tag)) {
    errors.tag = ['Tag must be lower-kebab-case (e.g. "mat", "bands-light").'];
  }
  const displayName = requiredTrimmedString(body, "displayName", 120);
  if (displayName === undefined) {
    errors.displayName = [
      "DisplayName is required and must not exceed 120 characters.",
    ];
  }
  const notes = nullableInputString(body, "notes", 1000, errors);
  if (
    Object.keys(errors).length > 0 ||
    tag === undefined ||
    displayName === undefined
  ) {
    return validationProblem(errors);
  }
  return { tag, displayName, notes };
}

export async function createEquipment(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const input = parseCreateEquipment(body);
  if (input instanceof Response) {
    return input;
  }
  const rows = await context.database().query(
    `INSERT INTO equipment (user_id, tag, display_name, notes, created_at)
     VALUES ($1::uuid, $2, $3, $4, now())
     ON CONFLICT (user_id, tag) DO NOTHING
     RETURNING ${EQUIPMENT_JSON} AS result`,
    [context.userId, input.tag, input.displayName, input.notes],
  );
  if (rows.length === 0) {
    return json(
      {
        error: "duplicate_tag",
        message: `Equipment tag '${input.tag}' is already registered for this user.`,
      },
      409,
    );
  }
  const result = rows[0]?.result;
  const id = isObject(result) && isString(result.id) ? result.id : undefined;
  return json(
    result,
    201,
    id === undefined ? undefined : { Location: `/v1/equipment/${id}` },
  );
}

export async function updateEquipment(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return requiredBodyError();
  }
  const errors: Record<string, string[]> = {};
  const displayName = requiredTrimmedString(body, "displayName", 120);
  if (displayName === undefined) {
    errors.displayName = [
      "DisplayName is required and must not exceed 120 characters.",
    ];
  }
  const notes = nullableInputString(body, "notes", 1000, errors);
  if (Object.keys(errors).length > 0 || displayName === undefined) {
    return validationProblem(errors);
  }
  const rows = await context.database().query(
    `UPDATE equipment
        SET display_name = $3, notes = $4
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING ${EQUIPMENT_JSON} AS result`,
    [context.params.id, context.userId, displayName, notes],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Equipment not found.")
    : json(rows[0]?.result);
}

export async function deleteEquipment(
  context: RequestContext,
): Promise<Response> {
  const rows = await context
    .database()
    .query(
      "DELETE FROM equipment WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id::text AS id",
      [context.params.id, context.userId],
    );
  return rows.length === 0
    ? problem(404, "Not Found", "Equipment not found.")
    : noContent();
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

export async function listActivities(
  context: RequestContext,
): Promise<Response> {
  const rawBodyArea = context.url.searchParams.get("bodyArea");
  const bodyArea = enumQueryValue(rawBodyArea, BODY_AREAS);
  if (rawBodyArea !== null && bodyArea === undefined) {
    return validationProblem({ bodyArea: ["bodyArea has an invalid value."] });
  }
  const rawDuration = context.url.searchParams.get("maxDurationSeconds");
  const maxDuration =
    rawDuration === null || !/^[1-9]\d*$/u.test(rawDuration)
      ? undefined
      : Number(rawDuration);
  if (
    rawDuration !== null &&
    (!Number.isSafeInteger(maxDuration) ||
      maxDuration === undefined ||
      maxDuration <= 0)
  ) {
    return validationProblem({
      maxDurationSeconds: ["maxDurationSeconds must be > 0."],
    });
  }
  const rawEquipment = context.url.searchParams.getAll("availableEquipmentTag");
  const availableEquipment =
    rawEquipment.length === 0
      ? null
      : rawEquipment
          .filter((tag) => tag.trim().length > 0)
          .map((tag) => tag.trim().toLowerCase());

  const rows = await context.database().query(
    `SELECT ${ACTIVITY_JSON} AS result
       FROM activities
      WHERE ($1::text IS NULL OR body_area = $1)
        AND ($2::integer IS NULL OR duration_seconds <= $2)
        AND ($3::text[] IS NULL OR equipment_tags <@ $3)
      ORDER BY duration_seconds, slug`,
    [bodyArea ?? null, maxDuration ?? null, availableEquipment],
  );
  return json(rows.map((row) => row.result));
}

function dateFromRow(row: DatabaseRow, field: string): Date | undefined {
  const value = row[field];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return isString(value) ? parseDateTime(value) : undefined;
}

export async function listGaps(context: RequestContext): Promise<Response> {
  const rawFrom = context.url.searchParams.get("from");
  const rawTo = context.url.searchParams.get("to");
  const from = rawFrom === null ? context.now() : parseDateTime(rawFrom);
  if (from === undefined) {
    return validationProblem({
      from: ["Query 'from' must be a valid date-time."],
    });
  }
  const to =
    rawTo === null
      ? new Date(from.getTime() + 24 * 60 * 60 * 1000)
      : parseDateTime(rawTo);
  if (to === undefined) {
    return validationProblem({ to: ["Query 'to' must be a valid date-time."] });
  }
  if (to.getTime() <= from.getTime()) {
    return validationProblem({
      to: ["Query 'to' must be greater than 'from'."],
    });
  }
  if (to.getTime() - from.getTime() > 14 * 24 * 60 * 60 * 1000) {
    return validationProblem({ to: ["Query window cannot exceed 14 days."] });
  }
  const timeZone = context.url.searchParams.get("tz") ?? "UTC";
  if (!isValidTimeZone(timeZone)) {
    return validationProblem({
      tz: [
        `Unknown time zone '${timeZone}'. Use an IANA name (e.g. 'America/New_York') or omit for UTC.`,
      ],
    });
  }

  const database = context.database();
  const busyRows = await database.query(
    `SELECT e.start_utc, e.end_utc
       FROM schedule_events e
       JOIN schedule_sources s ON s.id = e.source_id AND s.user_id = e.user_id
      WHERE e.user_id = $1::uuid
        AND e.busy
        AND s.connection_status <> 'Disabled'
        AND e.end_utc > $2::timestamptz
        AND e.start_utc < $3::timestamptz`,
    [context.userId, from.toISOString(), to.toISOString()],
  );
  const busy: BusyInterval[] = busyRows.flatMap((row) => {
    const start = dateFromRow(row, "start_utc");
    const end = dateFromRow(row, "end_utc");
    return start === undefined || end === undefined ? [] : [{ start, end }];
  });
  const cooldownStart = new Date(
    from.getTime() - DEFAULT_GAP_OPTIONS.cooldownMinutes * 60_000,
  );
  const promptRows = await database.query(
    `SELECT delivered_at
       FROM prompts
      WHERE user_id = $1::uuid
        AND delivered_at >= $2::timestamptz
        AND delivered_at < $3::timestamptz
      ORDER BY delivered_at`,
    [context.userId, cooldownStart.toISOString(), to.toISOString()],
  );
  const deliveries = promptRows.flatMap((row) => {
    const value = dateFromRow(row, "delivered_at");
    return value === undefined ? [] : [value];
  });
  const gaps = detectGaps(
    busy,
    from,
    to,
    deliveries,
    timeZone,
    DEFAULT_GAP_OPTIONS,
    context.now(),
  );
  return json(
    gaps.map((gap) => ({
      startUtc: gap.start.toISOString(),
      endUtc: gap.end.toISOString(),
      durationMinutes: Math.floor(
        (gap.end.getTime() - gap.start.getTime()) / 60_000,
      ),
    })),
  );
}
