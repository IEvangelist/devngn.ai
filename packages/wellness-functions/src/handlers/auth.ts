import type { RequestContext } from "../context.js";
import {
  ConfigurationError,
  getGitHubDeviceConfiguration,
  getGitHubWebConfiguration,
  getJwtConfiguration,
  isDevelopment,
} from "../lib/config.js";
import { pkceChallenge, randomUrlSafe, seal, unseal } from "../lib/crypto.js";
import type { Database, DatabaseRow } from "../lib/database.js";
import {
  json,
  problem,
  unavailableConfiguration,
  validationProblem,
} from "../lib/http.js";
import { isObject, isString, parseJsonObject } from "../lib/json.js";
import { createJwtService } from "../lib/jwt.js";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  isSafeReturnPath,
  normalizeGitHubId,
  nullableStringFromRow,
  stringFromRow,
} from "./shared.js";

interface GitHubUser {
  readonly id: string;
  readonly login: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

interface LocalUser {
  readonly id: string;
  readonly gitHubId: number | string;
  readonly login: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

interface DeviceFlowRow extends DatabaseRow {
  readonly encrypted_device_code?: unknown;
  readonly interval_seconds?: unknown;
}

interface OAuthStateRow extends DatabaseRow {
  readonly encrypted_verifier?: unknown;
  readonly return_path?: unknown;
}

function authError(
  error: string,
  status: number,
  description?: string,
  retryAfterSeconds?: number,
): Response {
  const headers = new Headers();
  if (retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return json(
    {
      error,
      ...(description === undefined ? {} : { description }),
    },
    status,
    headers,
  );
}

async function responseJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  return payload;
}

function stringProperty(value: unknown, name: string): string | undefined {
  return isObject(value) && isString(value[name]) ? value[name] : undefined;
}

function numberProperty(value: unknown, name: string): number | undefined {
  const candidate = isObject(value) ? value[name] : undefined;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

async function upsertUser(
  database: Database,
  github: GitHubUser,
): Promise<LocalUser> {
  const rows = await database.query(
    `INSERT INTO users (github_id, login, display_name, avatar_url, created_at, updated_at)
     VALUES ($1::bigint, $2, $3, $4, now(), now())
     ON CONFLICT (github_id) DO UPDATE
       SET login = EXCLUDED.login,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = now()
     RETURNING id::text AS id,
               github_id::text AS github_id,
               login,
               display_name,
               avatar_url`,
    [github.id, github.login, github.displayName, github.avatarUrl],
  );
  const row = rows[0];
  const id = stringFromRow(row, "id");
  const gitHubId = normalizeGitHubId(row?.github_id);
  const login = stringFromRow(row, "login");
  const displayName = nullableStringFromRow(row, "display_name");
  const avatarUrl = nullableStringFromRow(row, "avatar_url");
  if (
    id === undefined ||
    gitHubId === undefined ||
    login === undefined ||
    displayName === undefined ||
    avatarUrl === undefined
  ) {
    throw new Error("User upsert returned an invalid database row.");
  }
  return { id, gitHubId, login, displayName, avatarUrl };
}

async function githubUser(
  context: RequestContext,
  endpoint: string,
  accessToken: string,
): Promise<GitHubUser | Response> {
  const response = await context.fetchImpl(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "devngn.ai-wellness/1.0",
    },
  });
  if (!response.ok) {
    return problem(
      502,
      "GitHub user lookup failed",
      `GitHub returned HTTP ${response.status}.`,
    );
  }
  const payload = await responseJson(response);
  const rawId = isObject(payload) ? payload.id : undefined;
  const id =
    typeof rawId === "number" && Number.isSafeInteger(rawId)
      ? String(rawId)
      : isString(rawId)
        ? rawId
        : undefined;
  const login = stringProperty(payload, "login");
  if (id === undefined || login === undefined || login.trim().length === 0) {
    return problem(
      502,
      "GitHub user lookup failed",
      "GitHub returned an invalid user payload.",
    );
  }
  return {
    id,
    login: login.trim(),
    displayName: stringProperty(payload, "name") ?? null,
    avatarUrl: stringProperty(payload, "avatar_url") ?? null,
  };
}

async function issueAccessToken(
  context: RequestContext,
  githubAccessToken: string,
  userEndpoint: string,
): Promise<
  | {
      readonly response: Response;
      readonly accessToken: string;
      readonly expiresAt: Date;
    }
  | Response
> {
  const github = await githubUser(context, userEndpoint, githubAccessToken);
  if (github instanceof Response) {
    return github;
  }
  const user = await upsertUser(context.database(), github);
  const configuration = getJwtConfiguration(context.env);
  const expiresAt = new Date(
    context.now().getTime() + configuration.lifetimeSeconds * 1000,
  );
  const accessToken = await createJwtService(configuration, context.now).sign({
    sub: user.id,
    "gh:id": user.gitHubId,
    "gh:login": user.login,
    login: user.login,
    ...(user.displayName === null ? {} : { name: user.displayName }),
  });
  const response = json({
    accessToken,
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      gitHubId: user.gitHubId,
      login: user.login,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
  return { response, accessToken, expiresAt };
}

export async function startDeviceFlow(
  context: RequestContext,
): Promise<Response> {
  let device;
  let jwt;
  try {
    device = getGitHubDeviceConfiguration(context.env);
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return unavailableConfiguration(error.message);
    }
    throw error;
  }

  const response = await context.fetchImpl(device.deviceCodeEndpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: device.clientId,
      scope: "read:user",
    }),
  });
  if (!response.ok) {
    return problem(
      502,
      "GitHub device authorization failed",
      `GitHub returned HTTP ${response.status}.`,
    );
  }
  const payload = await responseJson(response);
  const deviceCode = stringProperty(payload, "device_code");
  const userCode = stringProperty(payload, "user_code");
  const verificationUri = stringProperty(payload, "verification_uri");
  const expiresIn = numberProperty(payload, "expires_in");
  const interval = numberProperty(payload, "interval");
  if (
    deviceCode === undefined ||
    userCode === undefined ||
    verificationUri === undefined ||
    expiresIn === undefined ||
    interval === undefined ||
    expiresIn < 1 ||
    interval < 1
  ) {
    return problem(
      502,
      "GitHub device authorization failed",
      "GitHub returned an invalid device-code payload.",
    );
  }

  const sessionId = randomUrlSafe(32);
  await context
    .database()
    .query("DELETE FROM auth_device_flows WHERE expires_at <= now()");
  await context.database().query(
    `INSERT INTO auth_device_flows
       (session_id, encrypted_device_code, interval_seconds, expires_at, created_at)
     VALUES ($1, $2, $3, now() + ($4 * interval '1 second'), now())`,
    [
      sessionId,
      await seal(deviceCode, jwt.secret),
      Math.max(1, Math.floor(interval)),
      Math.max(60, Math.floor(expiresIn)),
    ],
  );
  return json({
    sessionId,
    userCode,
    verificationUri,
    expiresInSeconds: Math.floor(expiresIn),
    intervalSeconds: Math.floor(interval),
  });
}

export async function pollDeviceFlow(
  context: RequestContext,
): Promise<Response> {
  let jwt;
  let device;
  try {
    jwt = getJwtConfiguration(context.env);
    device = getGitHubDeviceConfiguration(context.env);
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return unavailableConfiguration(error.message);
    }
    throw error;
  }
  const body = await parseJsonObject(context.request);
  const sessionId = body === null ? undefined : body.sessionId;
  if (!isString(sessionId) || sessionId.trim().length === 0) {
    return authError("invalid_request", 400, "sessionId is required.");
  }

  const database = context.database();
  const claimed = await database.query<DeviceFlowRow>(
    `UPDATE auth_device_flows
        SET last_polled_at = now()
      WHERE session_id = $1
        AND expires_at > now()
        AND (
          last_polled_at IS NULL OR
          last_polled_at <= now() - (interval_seconds * interval '1 second')
        )
      RETURNING encrypted_device_code, interval_seconds`,
    [sessionId],
  );
  if (claimed.length === 0) {
    const existing = await database.query<DeviceFlowRow>(
      `SELECT interval_seconds
         FROM auth_device_flows
        WHERE session_id = $1 AND expires_at > now()`,
      [sessionId],
    );
    const interval = numberFromDeviceRow(existing[0]);
    return interval === undefined
      ? authError(
          "expired_token",
          410,
          "Unknown or expired device flow session.",
        )
      : authError(
          "slow_down",
          429,
          `Wait at least ${interval}s between polls.`,
          interval,
        );
  }

  const claimedRow = claimed[0]!;
  const encryptedDeviceCode = stringFromRow(
    claimedRow,
    "encrypted_device_code",
  );
  const interval = numberFromDeviceRow(claimedRow);
  if (encryptedDeviceCode === undefined || interval === undefined) {
    throw new Error("Device flow state returned an invalid database row.");
  }
  const response = await context.fetchImpl(device.accessTokenEndpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: device.clientId,
      device_code: await unseal(encryptedDeviceCode, jwt.secret),
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const payload = await responseJson(response);
  const error = stringProperty(payload, "error");
  if (error !== undefined) {
    const description = stringProperty(payload, "error_description");
    if (error === "authorization_pending") {
      return authError(
        error,
        202,
        undefined,
        Math.max(1, numberProperty(payload, "interval") ?? 5),
      );
    }
    if (error === "slow_down") {
      const requestedInterval = Math.max(
        1,
        numberProperty(payload, "interval") ?? 10,
      );
      const newInterval = Math.max(interval, requestedInterval);
      await database.query(
        `UPDATE auth_device_flows
            SET interval_seconds = GREATEST(interval_seconds, $2)
          WHERE session_id = $1`,
        [sessionId, newInterval],
      );
      return authError(error, 429, undefined, requestedInterval);
    }

    await database.query(
      "DELETE FROM auth_device_flows WHERE session_id = $1",
      [sessionId],
    );
    const status =
      error === "expired_token"
        ? 410
        : error === "access_denied"
          ? 403
          : error === "device_flow_disabled"
            ? 409
            : 400;
    return authError(error, status, description);
  }

  const githubAccessToken = stringProperty(payload, "access_token");
  if (githubAccessToken === undefined) {
    await database.query(
      "DELETE FROM auth_device_flows WHERE session_id = $1",
      [sessionId],
    );
    return authError(
      "invalid_response",
      400,
      "GitHub returned neither an access token nor an error.",
    );
  }
  await database.query("DELETE FROM auth_device_flows WHERE session_id = $1", [
    sessionId,
  ]);
  const issued = await issueAccessToken(
    context,
    githubAccessToken,
    device.userEndpoint,
  );
  return issued instanceof Response ? issued : issued.response;
}

function numberFromDeviceRow(row: DatabaseRow | undefined): number | undefined {
  const value = row?.interval_seconds;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : isString(value) && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
}

export async function startWebFlow(context: RequestContext): Promise<Response> {
  const returnPath = context.url.searchParams.get("returnPath");
  if (!isSafeReturnPath(returnPath, context.url.origin)) {
    return authError(
      "invalid_return_path",
      400,
      "returnPath must be a relative path beginning with '/' and contain no scheme or '//'.",
    );
  }

  let configuration;
  let jwt;
  try {
    configuration = getGitHubWebConfiguration(context.env);
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return unavailableConfiguration(error.message);
    }
    throw error;
  }
  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const redirectUri = new URL(
    "/v1/auth/github/web/callback",
    context.url.origin,
  ).toString();
  await context
    .database()
    .query(
      "DELETE FROM auth_oauth_states WHERE expires_at <= now() OR consumed_at IS NOT NULL",
    );
  await context.database().query(
    `INSERT INTO auth_oauth_states
       (state, encrypted_verifier, return_path, expires_at, created_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes', now())`,
    [state, await seal(verifier, jwt.secret), returnPath],
  );

  const redirect = new URL(configuration.authorizeEndpoint);
  redirect.searchParams.set("client_id", configuration.clientId);
  redirect.searchParams.set("redirect_uri", redirectUri);
  redirect.searchParams.set("scope", "read:user");
  redirect.searchParams.set("state", state);
  redirect.searchParams.set("code_challenge", await pkceChallenge(verifier));
  redirect.searchParams.set("code_challenge_method", "S256");
  redirect.searchParams.set("allow_signup", "true");
  return new Response(null, {
    status: 302,
    headers: { Location: redirect.toString() },
  });
}

export async function completeWebFlow(
  context: RequestContext,
): Promise<Response> {
  const error = context.url.searchParams.get("error");
  const errorDescription = context.url.searchParams.get("error_description");
  if (error !== null && error.length > 0) {
    return authError(error, 400, errorDescription ?? undefined);
  }
  const code = context.url.searchParams.get("code");
  const state = context.url.searchParams.get("state");
  if (
    code === null ||
    code.length === 0 ||
    state === null ||
    state.length === 0
  ) {
    return authError("invalid_request", 400, "code and state are required.");
  }

  let configuration;
  let jwt;
  try {
    configuration = getGitHubWebConfiguration(context.env);
    jwt = getJwtConfiguration(context.env);
  } catch (configError: unknown) {
    if (configError instanceof ConfigurationError) {
      return unavailableConfiguration(configError.message);
    }
    throw configError;
  }
  const states = await context.database().query<OAuthStateRow>(
    `DELETE FROM auth_oauth_states
      WHERE state = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING encrypted_verifier, return_path`,
    [state],
  );
  const stateRow = states[0];
  const encryptedVerifier = stringFromRow(stateRow, "encrypted_verifier");
  const returnPath = nullableStringFromRow(stateRow, "return_path");
  if (
    encryptedVerifier === undefined ||
    returnPath === undefined ||
    !isSafeReturnPath(returnPath, context.url.origin)
  ) {
    return authError(
      "invalid_state",
      400,
      "Unknown, expired, or replayed state.",
    );
  }

  const redirectUri = new URL(
    "/v1/auth/github/web/callback",
    context.url.origin,
  ).toString();
  const tokenResponse = await context.fetchImpl(
    configuration.accessTokenEndpoint,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: await unseal(encryptedVerifier, jwt.secret),
      }),
    },
  );
  const tokenPayload = await responseJson(tokenResponse);
  const githubError = stringProperty(tokenPayload, "error");
  if (githubError !== undefined) {
    return authError(
      githubError,
      400,
      stringProperty(tokenPayload, "error_description"),
    );
  }
  const githubAccessToken = stringProperty(tokenPayload, "access_token");
  if (!tokenResponse.ok || githubAccessToken === undefined) {
    return problem(
      502,
      "GitHub authorization failed",
      `GitHub returned HTTP ${tokenResponse.status}.`,
    );
  }

  const issued = await issueAccessToken(
    context,
    githubAccessToken,
    configuration.userEndpoint,
  );
  if (issued instanceof Response) {
    return issued;
  }
  if (returnPath === null || returnPath.length === 0) {
    return issued.response;
  }
  const redirect = `${returnPath}#access_token=${encodeURIComponent(issued.accessToken)}&token_type=Bearer&expires_at=${Math.floor(issued.expiresAt.getTime() / 1000)}`;
  return new Response(null, { status: 302, headers: { Location: redirect } });
}

export async function getMe(context: RequestContext): Promise<Response> {
  if (context.userId === null) {
    return problem(401, "Unauthorized", "Authentication is required.");
  }
  const rows = await context.database().query(
    `SELECT json_build_object(
       'id', id::text,
       'gitHubId', github_id,
       'login', login,
       'displayName', display_name,
       'avatarUrl', avatar_url
     ) AS result
     FROM users
     WHERE id = $1::uuid`,
    [context.userId],
  );
  const result = rows[0]?.result;
  return result === undefined
    ? authError(
        "user_not_found",
        404,
        "The authenticated user no longer exists.",
      )
    : json(result);
}

export async function devLogin(context: RequestContext): Promise<Response> {
  if (!isDevelopment(context.env)) {
    return problem(404, "Not Found", `No handler for ${context.url.pathname}`);
  }
  let jwt;
  try {
    jwt = getJwtConfiguration(context.env);
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return unavailableConfiguration(error.message);
    }
    throw error;
  }
  const body = await parseJsonObject(context.request);
  const loginInput = body?.login;
  const displayNameInput = body?.displayName;
  const login =
    isString(loginInput) && loginInput.trim().length > 0
      ? loginInput.trim()
      : "devngn-local";
  const displayName =
    isString(displayNameInput) && displayNameInput.trim().length > 0
      ? displayNameInput.trim()
      : "Local Dev User";

  const user = await upsertUser(context.database(), {
    id: "-1",
    login,
    displayName,
    avatarUrl: null,
  });
  await context.database().query(
    `INSERT INTO consent_records (user_id, version, text, accepted_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET version = EXCLUDED.version,
           text = EXCLUDED.text,
           accepted_at = CASE
             WHEN consent_records.version = EXCLUDED.version
             THEN consent_records.accepted_at
             ELSE EXCLUDED.accepted_at
           END`,
    [user.id, CONSENT_VERSION, CONSENT_TEXT],
  );

  const expiresAt = new Date(
    context.now().getTime() + jwt.lifetimeSeconds * 1000,
  );
  const accessToken = await createJwtService(jwt, context.now).sign({
    sub: user.id,
    "gh:id": user.gitHubId,
    "gh:login": user.login,
    login: user.login,
    name: user.displayName ?? undefined,
  });
  return json({
    accessToken,
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      gitHubId: user.gitHubId,
      login: user.login,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
}
