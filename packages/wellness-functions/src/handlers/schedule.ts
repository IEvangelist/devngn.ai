import type { RequestContext } from "../context.js";
import {
  ConfigurationError,
  getCalendarProviderConfiguration,
  getJwtConfiguration,
  type CalendarProviderConfiguration,
} from "../lib/config.js";
import { pkceChallenge, randomUrlSafe, seal, unseal } from "../lib/crypto.js";
import type { Database, DatabaseRow } from "../lib/database.js";
import {
  json,
  noContent,
  problem,
  unavailableConfiguration,
  validationProblem,
} from "../lib/http.js";
import { isObject, isString, parseJsonObject } from "../lib/json.js";
import {
  CONSENT_VERSION,
  SCHEDULE_SOURCE_STATUSES,
  SCHEDULE_SOURCE_TYPES,
  dateOnly,
  enumValue,
  isSafeReturnPath,
  isUuid,
  nullableStringFromRow,
  parseDateTime,
  requiredTrimmedString,
  stringFromRow,
  utcDateTime,
} from "./shared.js";

type Provider = "google" | "microsoft";

interface ScheduleSourceRow extends DatabaseRow {
  readonly type?: unknown;
  readonly connection_status?: unknown;
  readonly encrypted_refresh_token?: unknown;
  readonly is_enabled?: unknown;
  readonly sync_token?: unknown;
}

interface ScheduleOAuthStateRow extends DatabaseRow {
  readonly user_id?: unknown;
  readonly encrypted_verifier?: unknown;
  readonly return_path?: unknown;
}

interface ProviderEvent {
  readonly externalId: string | null;
  readonly start: Date;
  readonly end: Date;
  readonly busy: boolean;
}

type ProviderSyncResult =
  | {
      readonly kind: "success";
      readonly events: readonly ProviderEvent[];
      readonly refreshedToken: string | null;
    }
  | { readonly kind: "reconnect"; readonly errorCode: string }
  | { readonly kind: "transient"; readonly errorCode: string };

const SOURCE_JSON = `json_build_object(
  'id', id::text,
  'type', type,
  'displayName', display_name,
  'connectionStatus', connection_status,
  'scope', scope,
  'lastSyncAt', last_sync_at,
  'lastRefreshAt', last_refresh_at,
  'lastSyncErrorCode', last_sync_error_code,
  'lastSyncErrorAt', last_sync_error_at,
  'createdAt', created_at
)`;

const EVENT_JSON = `json_build_object(
  'id', id::text,
  'sourceId', source_id::text,
  'externalId', external_id,
  'startUtc', start_utc,
  'endUtc', end_utc,
  'busy', busy
)`;

function appendQuery(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function providerName(provider: Provider): string {
  return provider === "google" ? "Google Calendar" : "Microsoft Calendar";
}

function providerSourceType(provider: Provider): "Google" | "Microsoft" {
  return provider === "google" ? "Google" : "Microsoft";
}

function unavailableProvider(provider: Provider): Response {
  return problem(
    503,
    "Calendar provider unavailable",
    `${providerName(provider)} is not configured for this deployment.`,
  );
}

function parseDateFromRow(row: DatabaseRow, field: string): Date | undefined {
  const value = row[field];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return isString(value) ? parseDateTime(value) : undefined;
}

async function responsePayload(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  return payload;
}

function payloadString(payload: unknown, field: string): string | undefined {
  return isObject(payload) && isString(payload[field])
    ? payload[field]
    : undefined;
}

function payloadBoolean(payload: unknown, field: string): boolean | undefined {
  return isObject(payload) && typeof payload[field] === "boolean"
    ? payload[field]
    : undefined;
}

function setProviderConfigError(error: unknown): Response | undefined {
  if (error instanceof ConfigurationError) {
    return unavailableConfiguration(error.message);
  }
  return undefined;
}

export async function listScheduleSources(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${SOURCE_JSON} AS result
       FROM schedule_sources
      WHERE user_id = $1::uuid
      ORDER BY created_at`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function getScheduleSource(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT ${SOURCE_JSON} AS result
       FROM schedule_sources
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [context.params.id, context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Schedule source not found.")
    : json(rows[0]?.result);
}

export async function createScheduleSource(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return validationProblem({ body: ["A JSON object is required."] });
  }
  const errors: Record<string, string[]> = {};
  const type = enumValue(body, "type", SCHEDULE_SOURCE_TYPES);
  if (type === undefined) {
    errors.type = [
      "type is required and must be a valid schedule source type.",
    ];
  }
  const displayName = requiredTrimmedString(body, "displayName", 200);
  if (displayName === undefined) {
    errors.displayName = [
      "displayName is required and must not exceed 200 characters.",
    ];
  }
  if (
    Object.keys(errors).length > 0 ||
    type === undefined ||
    displayName === undefined
  ) {
    return validationProblem(errors);
  }
  if (type !== "User") {
    return problem(
      400,
      "oauth_required",
      "Google and Microsoft schedule sources are created via /v1/schedule/connect/{provider}.",
    );
  }
  const rows = await context.database().query(
    `INSERT INTO schedule_sources
       (user_id, type, display_name, connection_status, is_enabled, created_at)
     VALUES ($1::uuid, 'User', $2, 'Connected', true, now())
     RETURNING ${SOURCE_JSON} AS result`,
    [context.userId, displayName],
  );
  const result = rows[0]?.result;
  const id = isObject(result) && isString(result.id) ? result.id : undefined;
  return json(
    result,
    201,
    id === undefined ? undefined : { Location: `/v1/schedule/sources/${id}` },
  );
}

export async function updateScheduleSource(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return validationProblem({ body: ["A JSON object is required."] });
  }
  const errors: Record<string, string[]> = {};
  let displayName: string | null = null;
  if (body.displayName !== undefined) {
    displayName = requiredTrimmedString(body, "displayName", 200) ?? null;
    if (displayName === null) {
      errors.displayName = [
        "displayName must not be empty or exceed 200 characters.",
      ];
    }
  }
  let requestedStatus: string | null = null;
  if (body.connectionStatus !== undefined) {
    requestedStatus =
      enumValue(body, "connectionStatus", SCHEDULE_SOURCE_STATUSES) ?? null;
    if (requestedStatus === null) {
      errors.connectionStatus = ["connectionStatus has an invalid value."];
    }
  }
  if (Object.keys(errors).length > 0) {
    return validationProblem(errors);
  }
  const existing = await context.database().query<ScheduleSourceRow>(
    `SELECT connection_status
       FROM schedule_sources
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [context.params.id, context.userId],
  );
  const currentStatus = stringFromRow(existing[0], "connection_status");
  if (currentStatus === undefined) {
    return problem(404, "Not Found", "Schedule source not found.");
  }
  if (
    requestedStatus !== null &&
    requestedStatus !== "Connected" &&
    requestedStatus !== "Disabled"
  ) {
    return problem(
      400,
      "invalid_status_transition",
      "Only 'Connected' (resume) and 'Disabled' (pause) are settable via PATCH.",
    );
  }
  if (requestedStatus === "Connected" && currentStatus === "NeedsReconnect") {
    return problem(
      409,
      "reconnect_required",
      "Source is in NeedsReconnect; re-run the OAuth connect flow to restore it.",
    );
  }

  const rows = await context.database().query(
    `UPDATE schedule_sources
        SET display_name = COALESCE($3, display_name),
            connection_status = COALESCE($4, connection_status),
            is_enabled = CASE
              WHEN $4::text = 'Connected' THEN true
              WHEN $4::text = 'Disabled' THEN false
              ELSE is_enabled
            END,
            sync_locked_at = CASE
              WHEN $4::text IS NULL THEN sync_locked_at
              ELSE NULL
            END,
            sync_token = CASE
              WHEN $4::text IS NULL THEN sync_token
              ELSE NULL
            END
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING ${SOURCE_JSON} AS result`,
    [context.params.id, context.userId, displayName, requestedStatus],
  );
  return json(rows[0]?.result);
}

export async function deleteScheduleSource(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `DELETE FROM schedule_sources
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id::text AS id`,
    [context.params.id, context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Schedule source not found.")
    : noContent();
}

export async function listScheduleEvents(
  context: RequestContext,
): Promise<Response> {
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
  if (to.getTime() - from.getTime() > 30 * 24 * 60 * 60 * 1000) {
    return validationProblem({ to: ["Query window cannot exceed 30 days."] });
  }
  const sourceId = context.url.searchParams.get("sourceId");
  if (sourceId !== null && !isUuid(sourceId)) {
    return validationProblem({ sourceId: ["sourceId must be a UUID."] });
  }
  const rows = await context.database().query(
    `SELECT ${EVENT_JSON} AS result
       FROM schedule_events
      WHERE user_id = $1::uuid
        AND end_utc > $2::timestamptz
        AND start_utc < $3::timestamptz
        AND ($4::uuid IS NULL OR source_id = $4::uuid)
      ORDER BY start_utc`,
    [context.userId, from.toISOString(), to.toISOString(), sourceId],
  );
  return json(rows.map((row) => row.result));
}

interface PushItem {
  readonly externalId: string;
  readonly start: Date;
  readonly end: Date;
  readonly busy: boolean;
}

function parsePushItems(
  body: Record<string, unknown>,
):
  | { readonly sourceId: string; readonly items: readonly PushItem[] }
  | Response {
  const errors: Record<string, string[]> = {};
  const sourceId = body.sourceId;
  if (!isString(sourceId) || !isUuid(sourceId)) {
    errors.sourceId = ["sourceId is required and must be a UUID."];
  }
  const rawItems = body.items;
  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0 ||
    rawItems.length > 200
  ) {
    errors.items = ["items must contain between 1 and 200 events."];
  }
  const parsed: PushItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rawItems)) {
    rawItems.forEach((candidate, index) => {
      if (!isObject(candidate)) {
        errors[`items[${index}]`] = ["Item must be an object."];
        return;
      }
      const externalId = candidate.externalId;
      if (
        !isString(externalId) ||
        externalId.trim().length === 0 ||
        externalId.length > 200
      ) {
        errors[`items[${index}].externalId`] = [
          "ExternalId is required and must not exceed 200 characters.",
        ];
        return;
      }
      if (seen.has(externalId)) {
        errors.items = [`Duplicate externalId '${externalId}' within batch.`];
        return;
      }
      seen.add(externalId);
      const start = isString(candidate.startUtc)
        ? utcDateTime(candidate.startUtc)
        : undefined;
      const end = isString(candidate.endUtc)
        ? utcDateTime(candidate.endUtc)
        : undefined;
      if (start === undefined) {
        errors[`items[${index}].startUtc`] = [
          "StartUtc must be expressed in UTC (offset 00:00).",
        ];
      }
      if (end === undefined) {
        errors[`items[${index}].endUtc`] = [
          "EndUtc must be expressed in UTC (offset 00:00).",
        ];
      }
      if (
        start !== undefined &&
        end !== undefined &&
        end.getTime() <= start.getTime()
      ) {
        errors[`items[${index}].endUtc`] = [
          "EndUtc must be strictly greater than StartUtc.",
        ];
      }
      if (candidate.busy !== undefined && typeof candidate.busy !== "boolean") {
        errors[`items[${index}].busy`] = ["Busy must be a boolean."];
      }
      if (
        start !== undefined &&
        end !== undefined &&
        end.getTime() > start.getTime() &&
        (candidate.busy === undefined || typeof candidate.busy === "boolean")
      ) {
        parsed.push({
          externalId,
          start,
          end,
          busy: candidate.busy === undefined ? true : candidate.busy === true,
        });
      }
    });
  }
  if (
    Object.keys(errors).length > 0 ||
    !isString(sourceId) ||
    !isUuid(sourceId)
  ) {
    return validationProblem(errors);
  }
  return { sourceId, items: parsed };
}

export async function pushScheduleEvents(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return validationProblem({ body: ["A JSON object is required."] });
  }
  const input = parsePushItems(body);
  if (input instanceof Response) {
    return input;
  }
  return context.database().transaction(async (database) => {
    const sourceRows = await database.query<ScheduleSourceRow>(
      `SELECT type, connection_status
         FROM schedule_sources
        WHERE id = $1::uuid AND user_id = $2::uuid
        FOR UPDATE`,
      [input.sourceId, context.userId],
    );
    const source = sourceRows[0];
    const type = stringFromRow(source, "type");
    const status = stringFromRow(source, "connection_status");
    if (type === undefined || status === undefined) {
      return problem(404, "Not Found", "Schedule source not found.");
    }
    if (type !== "User") {
      return problem(
        400,
        "wrong_source_type",
        "Direct event push is only allowed for sources of type 'User'.",
      );
    }
    if (status === "Disabled") {
      return problem(
        409,
        "source_disabled",
        "Resume the source via PATCH before pushing events.",
      );
    }

    const responses: unknown[] = [];
    for (const item of input.items) {
      const rows = await database.query(
        `INSERT INTO schedule_events
           (user_id, source_id, external_id, start_utc, end_utc, busy, ingested_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5::timestamptz, $6, now())
         ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL
         DO UPDATE SET
           start_utc = EXCLUDED.start_utc,
           end_utc = EXCLUDED.end_utc,
           busy = EXCLUDED.busy,
           ingested_at = now()
         RETURNING ${EVENT_JSON} AS result`,
        [
          context.userId,
          input.sourceId,
          item.externalId,
          item.start.toISOString(),
          item.end.toISOString(),
          item.busy,
        ],
      );
      responses.push(rows[0]?.result);
    }
    return json(responses);
  });
}

export async function deleteScheduleEvent(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `DELETE FROM schedule_events
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id::text AS id`,
    [context.params.id, context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Schedule event not found.")
    : noContent();
}

export async function beginCalendarConnect(
  context: RequestContext,
  provider: Provider,
): Promise<Response> {
  const returnPath = context.url.searchParams.get("returnPath");
  if (!isSafeReturnPath(returnPath, context.url.origin)) {
    return json(
      {
        error: "invalid_return_path",
        message:
          "returnPath must be a relative path beginning with '/' with no scheme or '//'.",
      },
      400,
    );
  }
  let providerConfiguration;
  let jwt;
  try {
    providerConfiguration = getCalendarProviderConfiguration(
      context.env,
      provider,
    );
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    const response = setProviderConfigError(error);
    if (response !== undefined) {
      return response;
    }
    throw error;
  }
  if (providerConfiguration === null) {
    return unavailableProvider(provider);
  }

  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  await context
    .database()
    .query(
      "DELETE FROM schedule_oauth_states WHERE expires_at <= now() OR consumed_at IS NOT NULL",
    );
  await context.database().query(
    `INSERT INTO schedule_oauth_states
       (state, provider, user_id, encrypted_verifier, return_path, expires_at, created_at)
     VALUES ($1, $2, $3::uuid, $4, $5, now() + interval '10 minutes', now())`,
    [
      state,
      provider === "google" ? "Google" : "Microsoft",
      context.userId,
      await seal(verifier, jwt.secret),
      returnPath === null || returnPath.length === 0 ? "/" : returnPath,
    ],
  );

  const redirect = authorizationUrl(
    providerConfiguration,
    state,
    await pkceChallenge(verifier),
  );
  return new Response(null, { status: 302, headers: { Location: redirect } });
}

function authorizationUrl(
  configuration: CalendarProviderConfiguration,
  state: string,
  challenge: string,
): string {
  if (configuration.provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", configuration.clientId);
    url.searchParams.set("redirect_uri", configuration.redirectUri);
    url.searchParams.set("scope", configuration.scope);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId ?? "common")}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("scope", configuration.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_mode", "query");
  return url.toString();
}

async function consumeScheduleState(
  context: RequestContext,
  provider: Provider,
  state: string,
): Promise<ScheduleOAuthStateRow | undefined> {
  const rows = await context.database().query<ScheduleOAuthStateRow>(
    `DELETE FROM schedule_oauth_states
      WHERE state = $1
        AND provider = $2
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING user_id::text AS user_id, encrypted_verifier, return_path`,
    [state, provider === "google" ? "Google" : "Microsoft"],
  );
  return rows[0];
}

async function oauthCallbackUserState(
  database: Database,
  userId: string,
): Promise<"user_not_found" | "consent_required" | "ready"> {
  const rows = await database.query(
    `SELECT u.id::text AS user_id, c.version
       FROM users u
       LEFT JOIN consent_records c ON c.user_id = u.id
      WHERE u.id = $1::uuid`,
    [userId],
  );
  if (rows.length === 0) {
    return "user_not_found";
  }
  return stringFromRow(rows[0], "version") === undefined
    ? "consent_required"
    : "ready";
}

function scopeContains(
  requestedScope: string,
  grantedScope: string | undefined,
  provider: Provider,
): boolean {
  if (grantedScope === undefined) {
    return false;
  }
  const requested = requestedScope
    .split(" ")
    .filter((value) => value.length > 0)
    .filter((value) =>
      provider === "microsoft"
        ? !["openid", "profile", "email", "offline_access"].includes(
            value.toLowerCase(),
          )
        : true,
    )
    .map((value) =>
      value.replace(/^https:\/\/graph\.microsoft\.com\//iu, "").toLowerCase(),
    );
  const granted = new Set(
    grantedScope
      .split(" ")
      .filter((value) => value.length > 0)
      .map((value) =>
        value.replace(/^https:\/\/graph\.microsoft\.com\//iu, "").toLowerCase(),
      ),
  );
  return requested.every((value) => granted.has(value));
}

async function exchangeCalendarCode(
  context: RequestContext,
  configuration: CalendarProviderConfiguration,
  code: string,
  verifier: string,
): Promise<
  | {
      readonly kind: "success";
      readonly refreshToken: string;
      readonly scope: string | undefined;
    }
  | { readonly kind: "invalid_grant" }
  | { readonly kind: "unavailable" }
> {
  const endpoint =
    configuration.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId ?? "common")}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    code,
    redirect_uri: configuration.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const response = await context.fetchImpl(endpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
  const payload = await responsePayload(response);
  const error = payloadString(payload, "error");
  if (!response.ok || error !== undefined) {
    return error === "invalid_grant"
      ? { kind: "invalid_grant" }
      : { kind: "unavailable" };
  }
  const refreshToken = payloadString(payload, "refresh_token");
  if (refreshToken === undefined || refreshToken.length === 0) {
    return { kind: "unavailable" };
  }
  return {
    kind: "success",
    refreshToken,
    scope: payloadString(payload, "scope"),
  };
}

export async function completeCalendarConnect(
  context: RequestContext,
  provider: Provider,
): Promise<Response> {
  const state = context.url.searchParams.get("state");
  if (state === null || state.length === 0) {
    return json({ error: "missing_state" }, 400);
  }
  let providerConfiguration;
  let jwt;
  try {
    providerConfiguration = getCalendarProviderConfiguration(
      context.env,
      provider,
    );
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    const response = setProviderConfigError(error);
    if (response !== undefined) {
      return response;
    }
    throw error;
  }
  if (providerConfiguration === null) {
    return unavailableProvider(provider);
  }
  const snapshot = await consumeScheduleState(context, provider, state);
  const userId = stringFromRow(snapshot, "user_id");
  const encryptedVerifier = stringFromRow(snapshot, "encrypted_verifier");
  const returnPath = nullableStringFromRow(snapshot, "return_path");
  if (
    userId === undefined ||
    encryptedVerifier === undefined ||
    returnPath === undefined ||
    returnPath === null ||
    !isSafeReturnPath(returnPath, context.url.origin)
  ) {
    return json({ error: "invalid_state" }, 400);
  }
  const oauthError = context.url.searchParams.get("error");
  if (oauthError !== null && oauthError.length > 0) {
    return new Response(null, {
      status: 302,
      headers: { Location: appendQuery(returnPath, "error", oauthError) },
    });
  }
  const code = context.url.searchParams.get("code");
  if (code === null || code.length === 0) {
    return new Response(null, {
      status: 302,
      headers: { Location: appendQuery(returnPath, "error", "missing_code") },
    });
  }
  const userState = await oauthCallbackUserState(context.database(), userId);
  if (userState !== "ready") {
    return new Response(null, {
      status: 302,
      headers: { Location: appendQuery(returnPath, "error", userState) },
    });
  }
  const exchanged = await exchangeCalendarCode(
    context,
    providerConfiguration,
    code,
    await unseal(encryptedVerifier, jwt.secret),
  );
  if (exchanged.kind !== "success") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: appendQuery(
          returnPath,
          "error",
          exchanged.kind === "invalid_grant"
            ? "invalid_grant"
            : `${provider}_unavailable`,
        ),
      },
    });
  }
  if (!scopeContains(providerConfiguration.scope, exchanged.scope, provider)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: appendQuery(returnPath, "error", "insufficient_scope"),
      },
    });
  }

  const sourceType = providerSourceType(provider);
  await context.database().transaction(async (database) => {
    const sources = await database.query(
      `INSERT INTO schedule_sources
       (user_id, type, display_name, encrypted_refresh_token, scope, last_refresh_at,
        connection_status, is_enabled, created_at)
     VALUES ($1::uuid, $2, $3, $4, $5, now(), 'Connected', true, now())
     ON CONFLICT (user_id, type) WHERE type IN ('Google', 'Microsoft')
     DO UPDATE SET
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       scope = EXCLUDED.scope,
       last_refresh_at = EXCLUDED.last_refresh_at,
       connection_status = 'Connected',
       is_enabled = true,
       sync_locked_at = NULL,
       sync_token = NULL,
       last_sync_error_code = NULL,
       last_sync_error_at = NULL
     RETURNING id::text AS id`,
      [
        userId,
        sourceType,
        providerName(provider),
        await seal(exchanged.refreshToken, jwt.secret),
        exchanged.scope ?? providerConfiguration.scope,
      ],
    );
    const sourceId = stringFromRow(sources[0], "id");
    if (sourceId === undefined) {
      throw new Error("Calendar connection returned an invalid database row.");
    }
    await database.query(
      "DELETE FROM schedule_events WHERE source_id = $1::uuid AND user_id = $2::uuid",
      [sourceId, userId],
    );
  });
  return new Response(null, {
    status: 302,
    headers: { Location: appendQuery(returnPath, "connected", provider) },
  });
}

async function providerRefreshToken(
  context: RequestContext,
  configuration: CalendarProviderConfiguration,
  refreshToken: string,
): Promise<
  | {
      readonly kind: "success";
      readonly accessToken: string;
      readonly refreshToken: string | null;
    }
  | { readonly kind: "reconnect"; readonly errorCode: string }
  | { readonly kind: "transient"; readonly errorCode: string }
> {
  const endpoint =
    configuration.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId ?? "common")}/oauth2/v2.0/token`;
  const response = await context.fetchImpl(endpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      ...(configuration.provider === "microsoft"
        ? { scope: configuration.scope }
        : {}),
    }),
  });
  const payload = await responsePayload(response);
  const error = payloadString(payload, "error");
  if (!response.ok || error !== undefined) {
    return error === "invalid_grant"
      ? { kind: "reconnect", errorCode: "invalid_grant" }
      : { kind: "transient", errorCode: error ?? `http_${response.status}` };
  }
  const accessToken = payloadString(payload, "access_token");
  if (accessToken === undefined) {
    return { kind: "transient", errorCode: "invalid_response" };
  }
  return {
    kind: "success",
    accessToken,
    refreshToken: payloadString(payload, "refresh_token") ?? null,
  };
}

function parseGoogleEvents(payload: unknown): readonly ProviderEvent[] {
  const calendars =
    isObject(payload) && isObject(payload.calendars)
      ? payload.calendars
      : undefined;
  const primary =
    calendars !== undefined && isObject(calendars.primary)
      ? calendars.primary
      : undefined;
  const busy = primary?.busy;
  if (!Array.isArray(busy)) {
    return [];
  }
  return busy.flatMap((item) => {
    if (!isObject(item) || !isString(item.start) || !isString(item.end)) {
      return [];
    }
    const start = parseDateTime(item.start);
    const end = parseDateTime(item.end);
    return start === undefined ||
      end === undefined ||
      end.getTime() <= start.getTime()
      ? []
      : [{ externalId: null, start, end, busy: true }];
  });
}

function graphDate(value: unknown): Date | undefined {
  if (!isObject(value) || !isString(value.dateTime)) {
    return undefined;
  }
  if (!isString(value.timeZone) || value.timeZone.toUpperCase() !== "UTC") {
    return undefined;
  }
  const date = value.dateTime.endsWith("Z")
    ? parseDateTime(value.dateTime)
    : parseDateTime(`${value.dateTime}Z`);
  return date;
}

function parseMicrosoftEvents(payload: unknown): readonly ProviderEvent[] {
  if (!isObject(payload) || !Array.isArray(payload.value)) {
    return [];
  }
  return payload.value.flatMap((item) => {
    if (!isObject(item) || payloadBoolean(item, "isCancelled") === true) {
      return [];
    }
    const showAs = payloadString(item, "showAs");
    if (
      showAs === undefined ||
      !["busy", "oof", "workingElsewhere", "tentative"].includes(showAs)
    ) {
      return [];
    }
    const start = graphDate(item.start);
    const end = graphDate(item.end);
    return start === undefined ||
      end === undefined ||
      end.getTime() <= start.getTime()
      ? []
      : [
          {
            externalId: null,
            start,
            end,
            busy: true,
          },
        ];
  });
}

async function fetchProviderEvents(
  context: RequestContext,
  configuration: CalendarProviderConfiguration,
  accessToken: string,
  from: Date,
  to: Date,
): Promise<ProviderSyncResult> {
  if (configuration.provider === "google") {
    const response = await context.fetchImpl(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: "primary" }],
        }),
      },
    );
    const payload = await responsePayload(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { kind: "reconnect", errorCode: "invalid_grant" };
      }
      return {
        kind: "transient",
        errorCode: `http_${response.status}`,
      };
    }
    const calendars =
      isObject(payload) && isObject(payload.calendars)
        ? payload.calendars
        : undefined;
    const primary =
      calendars !== undefined && isObject(calendars.primary)
        ? calendars.primary
        : undefined;
    if (Array.isArray(primary?.errors) && primary.errors.length > 0) {
      return { kind: "transient", errorCode: "calendar_error" };
    }
    if (!Array.isArray(primary?.busy)) {
      return { kind: "transient", errorCode: "invalid_provider_response" };
    }
    return {
      kind: "success",
      events: parseGoogleEvents(payload),
      refreshedToken: null,
    };
  }

  const endpoint = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  endpoint.searchParams.set("startDateTime", from.toISOString());
  endpoint.searchParams.set("endDateTime", to.toISOString());
  endpoint.searchParams.set("$select", "start,end,showAs,isCancelled");
  endpoint.searchParams.set("$top", "999");
  let nextUrl = endpoint.toString();
  let completed = false;
  const events: ProviderEvent[] = [];
  for (let page = 0; page < 10; page += 1) {
    const response = await context.fetchImpl(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      if (response.status === 401) {
        return { kind: "reconnect", errorCode: "invalid_grant" };
      }
      return {
        kind: "transient",
        errorCode: `http_${response.status}`,
      };
    }
    if (!isObject(payload) || !Array.isArray(payload.value)) {
      return { kind: "transient", errorCode: "invalid_provider_response" };
    }
    events.push(...parseMicrosoftEvents(payload));
    const following = payloadString(payload, "@odata.nextLink");
    if (following === undefined || following.length === 0) {
      completed = true;
      break;
    }
    nextUrl = following;
  }
  if (!completed) {
    return { kind: "transient", errorCode: "pagination_limit" };
  }
  return {
    kind: "success",
    events,
    refreshedToken: null,
  };
}

async function persistSyncedEvents(
  database: Database,
  sourceId: string,
  userId: string,
  syncToken: string,
  encryptedRefreshToken: string | null,
  events: readonly ProviderEvent[],
  syncStart: Date,
  syncEnd: Date,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const sources = await transaction.query(
      `SELECT 1 AS present
         FROM schedule_sources
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND is_enabled
          AND sync_token = $3
        FOR UPDATE`,
      [sourceId, userId, syncToken],
    );
    if (sources.length === 0) {
      return false;
    }
    await transaction.query(
      `DELETE FROM schedule_events
        WHERE source_id = $1::uuid
          AND user_id = $2::uuid
          AND end_utc > $3::timestamptz
          AND start_utc < $4::timestamptz`,
      [sourceId, userId, syncStart.toISOString(), syncEnd.toISOString()],
    );
    if (events.length > 0) {
      await transaction.query(
        `INSERT INTO schedule_events
           (user_id, source_id, external_id, start_utc, end_utc, busy, ingested_at)
         SELECT $1::uuid,
                $2::uuid,
                event->>'externalId',
                (event->>'startUtc')::timestamptz,
                (event->>'endUtc')::timestamptz,
                (event->>'busy')::boolean,
                now()
           FROM jsonb_array_elements($3::jsonb) AS event`,
        [
          userId,
          sourceId,
          JSON.stringify(
            events.map((event) => ({
              externalId: event.externalId,
              startUtc: event.start.toISOString(),
              endUtc: event.end.toISOString(),
              busy: event.busy,
            })),
          ),
        ],
      );
    }
    const completed = await transaction.query(
      `UPDATE schedule_sources
          SET connection_status = 'Connected',
              last_sync_at = now(),
              last_refresh_at = now(),
              encrypted_refresh_token = COALESCE($4, encrypted_refresh_token),
              last_sync_error_code = NULL,
              last_sync_error_at = NULL
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND sync_token = $3
          AND is_enabled
        RETURNING id::text AS id`,
      [sourceId, userId, syncToken, encryptedRefreshToken],
    );
    return completed.length > 0;
  });
}

async function markNeedsReconnect(
  database: Database,
  sourceId: string,
  userId: string,
  syncToken: string,
  errorCode: string,
  deleteFutureFrom: Date | undefined,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const updated = await transaction.query(
      `UPDATE schedule_sources
          SET connection_status = 'NeedsReconnect',
              is_enabled = false,
              last_sync_error_code = $3,
              last_sync_error_at = now()
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND sync_token = $4
          AND is_enabled
        RETURNING id::text AS id`,
      [sourceId, userId, errorCode, syncToken],
    );
    if (updated.length === 0) {
      return false;
    }
    if (deleteFutureFrom !== undefined) {
      await transaction.query(
        `DELETE FROM schedule_events
          WHERE source_id = $1::uuid
            AND user_id = $2::uuid
            AND end_utc > $3::timestamptz`,
        [sourceId, userId, deleteFutureFrom.toISOString()],
      );
    }
    return true;
  });
}

async function markSyncError(
  database: Database,
  sourceId: string,
  userId: string,
  syncToken: string,
  errorCode: string,
): Promise<boolean> {
  const updated = await database.query(
    `UPDATE schedule_sources
        SET connection_status = 'Error',
            last_sync_error_code = $3,
            last_sync_error_at = now()
      WHERE id = $1::uuid
        AND user_id = $2::uuid
        AND sync_token = $4
        AND is_enabled
      RETURNING id::text AS id`,
    [sourceId, userId, errorCode, syncToken],
  );
  return updated.length > 0;
}

function syncSuperseded(): Response {
  return problem(
    409,
    "sync_superseded",
    "The source changed while synchronization was in progress; retry if it is still enabled.",
  );
}

export async function syncScheduleSource(
  context: RequestContext,
): Promise<Response> {
  const userId = context.userId;
  if (userId === null) {
    return problem(401, "Unauthorized", "Authentication is required.");
  }
  const sourceRows = await context.database().query<ScheduleSourceRow>(
    `SELECT type, connection_status, encrypted_refresh_token, is_enabled
       FROM schedule_sources
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [context.params.id, userId],
  );
  const source = sourceRows[0];
  const type = stringFromRow(source, "type");
  const status = stringFromRow(source, "connection_status");
  const isEnabled = source?.is_enabled === true;
  const encryptedRefreshToken = stringFromRow(
    source,
    "encrypted_refresh_token",
  );
  if (type === undefined || status === undefined) {
    return problem(404, "Not Found", "Schedule source not found.");
  }
  if (type === "User") {
    return problem(404, "Not Found", "User schedule sources are not syncable.");
  }
  const provider: Provider = type === "Google" ? "google" : "microsoft";
  let configuration;
  let jwt;
  try {
    configuration = getCalendarProviderConfiguration(context.env, provider);
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    const response = setProviderConfigError(error);
    if (response !== undefined) {
      return response;
    }
    throw error;
  }
  if (configuration === null) {
    return unavailableProvider(provider);
  }
  if (!isEnabled || status === "Disabled") {
    return problem(
      409,
      "source_disabled",
      "The source is disabled; re-enable it via PATCH before syncing.",
    );
  }
  if (status === "NeedsReconnect" || encryptedRefreshToken === undefined) {
    return problem(
      422,
      "needs_reconnect",
      "Source needs reconnection (invalid_grant).",
    );
  }

  const syncToken = randomUrlSafe(32);
  const lock = await context.database().query(
    `UPDATE schedule_sources
        SET sync_locked_at = now(),
            sync_token = $3
      WHERE id = $1::uuid
        AND user_id = $2::uuid
        AND is_enabled
        AND connection_status <> 'Disabled'
        AND encrypted_refresh_token = $4
        AND (sync_locked_at IS NULL OR sync_locked_at < now() - interval '5 minutes')
      RETURNING id::text AS id`,
    [context.params.id, userId, syncToken, encryptedRefreshToken],
  );
  if (lock.length === 0) {
    return problem(
      409,
      "sync_in_progress",
      "A sync is already running for this source.",
    );
  }

  const syncStart = context.now();
  const syncEnd = new Date(syncStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  try {
    let refreshToken: string;
    try {
      refreshToken = await unseal(encryptedRefreshToken, jwt.secret);
    } catch (error: unknown) {
      if (error instanceof Error) {
        const marked = await markNeedsReconnect(
          context.database(),
          context.params.id,
          userId,
          syncToken,
          "protector_failed",
          undefined,
        );
        if (!marked) {
          return syncSuperseded();
        }
        return problem(
          422,
          "needs_reconnect",
          "Source needs reconnection (protector_failed).",
        );
      }
      throw error;
    }
    const refreshed = await providerRefreshToken(
      context,
      configuration,
      refreshToken,
    );
    if (refreshed.kind === "reconnect") {
      const marked = await markNeedsReconnect(
        context.database(),
        context.params.id,
        userId,
        syncToken,
        refreshed.errorCode,
        syncStart,
      );
      if (!marked) {
        return syncSuperseded();
      }
      return problem(
        422,
        "needs_reconnect",
        `Source needs reconnection (${refreshed.errorCode}).`,
      );
    }
    if (refreshed.kind === "transient") {
      const marked = await markSyncError(
        context.database(),
        context.params.id,
        userId,
        syncToken,
        refreshed.errorCode,
      );
      if (!marked) {
        return syncSuperseded();
      }
      return problem(
        503,
        "sync_transient_failure",
        `Sync failed transiently (${refreshed.errorCode}); retry later.`,
      );
    }
    const events = await fetchProviderEvents(
      context,
      configuration,
      refreshed.accessToken,
      syncStart,
      syncEnd,
    );
    if (events.kind === "reconnect") {
      const marked = await markNeedsReconnect(
        context.database(),
        context.params.id,
        userId,
        syncToken,
        events.errorCode,
        syncStart,
      );
      if (!marked) {
        return syncSuperseded();
      }
      return problem(
        422,
        "needs_reconnect",
        `Source needs reconnection (${events.errorCode}).`,
      );
    }
    if (events.kind === "transient") {
      const marked = await markSyncError(
        context.database(),
        context.params.id,
        userId,
        syncToken,
        events.errorCode,
      );
      if (!marked) {
        return syncSuperseded();
      }
      return problem(
        503,
        "sync_transient_failure",
        `Sync failed transiently (${events.errorCode}); retry later.`,
      );
    }
    const encryptedRotatedToken =
      refreshed.refreshToken === null
        ? null
        : await seal(refreshed.refreshToken, jwt.secret);
    const persisted = await persistSyncedEvents(
      context.database(),
      context.params.id,
      userId,
      syncToken,
      encryptedRotatedToken,
      events.events,
      syncStart,
      syncEnd,
    );
    if (!persisted) {
      return syncSuperseded();
    }
    return json({ synced: events.events.length });
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      const marked = await markSyncError(
        context.database(),
        context.params.id,
        userId,
        syncToken,
        "network_error",
      );
      if (!marked) {
        return syncSuperseded();
      }
      return problem(
        503,
        "sync_transient_failure",
        "Sync failed transiently (network_error); retry later.",
      );
    }
    throw error;
  } finally {
    await context.database().query(
      `UPDATE schedule_sources
          SET sync_locked_at = NULL,
              sync_token = NULL
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND sync_token = $3`,
      [context.params.id, userId, syncToken],
    );
  }
}
