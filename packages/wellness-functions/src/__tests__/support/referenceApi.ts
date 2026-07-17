// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

export const TAURI_LOCALHOST = "tauri://localhost";
export const TAURI_WINDOWS_LOCALHOST = "https://tauri.localhost";
export const DEVNGN_PRODUCTION_ORIGIN = "https://devngn.ai";
export const DEFAULT_ALLOWED_ORIGINS = [
  TAURI_LOCALHOST,
  TAURI_WINDOWS_LOCALHOST,
  DEVNGN_PRODUCTION_ORIGIN,
] as const;

export const CURRENT_CONSENT_VERSION = "1.0";
export const CURRENT_CONSENT_TEXT =
  "I consent to devngn.ai Wellness storing my profile, schedule gaps, and prompt history.";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ProblemDetails {
  readonly type: "about:blank";
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
}

export interface ValidationProblemDetails extends ProblemDetails {
  readonly errors: Record<string, readonly string[]>;
}

export interface JwtOptionsLike {
  readonly issuer: string;
  readonly audience: string;
  readonly signingKey: string;
  readonly keyId: string;
  readonly accessTokenLifetimeMinutes: number;
}

export interface GitHubOAuthConfigLike {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly deviceCodeEndpoint: string;
  readonly accessTokenEndpoint: string;
  readonly authorizeEndpoint: string;
  readonly userEndpoint: string;
  readonly webCallbackPath: string;
  readonly userAgent: string;
}

export interface ProductionConfigLike {
  readonly allowedOrigins: readonly string[];
  readonly jwt: JwtOptionsLike;
  readonly github: GitHubOAuthConfigLike;
}

export interface JwtPayload {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  readonly name?: string;
  readonly "gh:id"?: number;
  readonly "gh:login"?: string;
}

export interface JwtClaims {
  readonly sub: string;
  readonly name?: string;
  readonly githubId?: number;
  readonly login?: string;
}

export interface ReferenceUser {
  readonly id: string;
  readonly githubId: number;
  readonly login: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

export interface OAuthStateRecord {
  readonly state: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly returnPath?: string;
  readonly expiresAt: string;
}

export interface DeviceFlowSession {
  readonly deviceCode: string;
  readonly intervalSeconds: number;
  readonly expiresAt: string;
  readonly tooSoon: boolean;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...toHeaderRecord(headers),
    },
  });
}

export function problemJson(
  status: number,
  title: string,
  detail?: string,
): Response {
  const body: ProblemDetails = {
    type: "about:blank",
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

export function validationProblemJson(
  errors: Record<string, readonly string[]>,
): Response {
  const body: ValidationProblemDetails = {
    type: "about:blank",
    title: "One or more validation errors occurred.",
    status: 400,
    errors,
  };
  return new Response(JSON.stringify(body), {
    status: 400,
    headers: { "Content-Type": "application/problem+json" },
  });
}

export function emptyResponse(status: number, headers?: HeadersInit): Response {
  return new Response(null, {
    status,
    headers,
  });
}

export function isExactAllowedOrigin(
  origin: string | null,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): origin is string {
  return origin !== null && allowedOrigins.includes(origin);
}

export function corsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): Record<string, string> | null {
  if (!isExactAllowedOrigin(origin, allowedOrigins)) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function handlePreflight(
  request: Request,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, allowedOrigins);
  if (headers === null) {
    return emptyResponse(403);
  }

  return emptyResponse(204, {
    ...headers,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
  });
}

export function withCors(
  response: Response,
  origin: string | null,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): Response {
  const headers = corsHeaders(origin, allowedOrigins);
  if (headers === null) {
    return response;
  }

  const combined = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    combined.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    headers: combined,
  });
}

export class FakeClock {
  #current: Date;

  constructor(startIso = "2026-07-01T12:00:00.000Z") {
    this.#current = new Date(startIso);
  }

  now(): Date {
    return new Date(this.#current);
  }

  advanceMilliseconds(milliseconds: number): void {
    this.#current = new Date(this.#current.getTime() + milliseconds);
  }

  advanceSeconds(seconds: number): void {
    this.advanceMilliseconds(seconds * 1_000);
  }

  advanceMinutes(minutes: number): void {
    this.advanceMilliseconds(minutes * 60_000);
  }
}

export function validateJwtOptions(options: JwtOptionsLike): readonly string[] {
  const failures: string[] = [];

  if (options.issuer.trim().length === 0) {
    failures.push("issuer is required.");
  }
  if (options.audience.trim().length === 0) {
    failures.push("audience is required.");
  }
  if (options.keyId.trim().length === 0) {
    failures.push("keyId is required.");
  }
  if (
    !Number.isInteger(options.accessTokenLifetimeMinutes) ||
    options.accessTokenLifetimeMinutes < 1 ||
    options.accessTokenLifetimeMinutes > 1_440
  ) {
    failures.push("accessTokenLifetimeMinutes must be between 1 and 1440.");
  }

  if (options.signingKey.trim().length === 0) {
    failures.push("signingKey is required.");
    return failures;
  }

  try {
    const decoded = Buffer.from(options.signingKey, "base64");
    if (decoded.length < 32) {
      failures.push(
        `signingKey must decode to at least 32 bytes (got ${decoded.length}).`,
      );
    }
  } catch {
    failures.push("signingKey must be valid base64.");
  }

  return failures;
}

export function validateGitHubOAuthConfig(
  config: GitHubOAuthConfigLike,
): readonly string[] {
  const failures: string[] = [];

  if (config.clientId.trim().length === 0) {
    failures.push("clientId is required.");
  }
  if (config.clientSecret.trim().length === 0) {
    failures.push("clientSecret is required.");
  }
  if (config.userAgent.trim().length === 0) {
    failures.push("userAgent is required.");
  }
  if (config.webCallbackPath.trim().length === 0) {
    failures.push("webCallbackPath is required.");
  }

  for (const [name, value] of [
    ["deviceCodeEndpoint", config.deviceCodeEndpoint],
    ["accessTokenEndpoint", config.accessTokenEndpoint],
    ["authorizeEndpoint", config.authorizeEndpoint],
    ["userEndpoint", config.userEndpoint],
  ] as const) {
    if (!isHttpUrl(value)) {
      failures.push(`${name} must be an absolute http(s) URL.`);
    }
  }

  return failures;
}

export function validateProductionConfig(
  config: ProductionConfigLike,
): readonly string[] {
  const failures = [
    ...validateJwtOptions(config.jwt),
    ...validateGitHubOAuthConfig(config.github),
  ];

  if (config.allowedOrigins.length === 0) {
    failures.push("allowedOrigins must contain at least one exact origin.");
  }

  for (const origin of config.allowedOrigins) {
    if (origin === "*") {
      failures.push("allowedOrigins must not contain '*'.");
      continue;
    }
    if (!isExactOriginString(origin)) {
      failures.push(`allowedOrigins contains an invalid origin: ${origin}`);
    }
  }

  return failures;
}

export class ReferenceJwtService {
  readonly #options: JwtOptionsLike;
  readonly #clock: FakeClock;

  constructor(options: JwtOptionsLike, clock: FakeClock) {
    const failures = validateJwtOptions(options);
    if (failures.length > 0) {
      throw new Error(failures.join(" "));
    }

    this.#options = options;
    this.#clock = clock;
  }

  issue(claims: JwtClaims): {
    readonly accessToken: string;
    readonly tokenType: "Bearer";
    readonly expiresAt: string;
  } {
    const nowSeconds = Math.floor(this.#clock.now().getTime() / 1_000);
    const expSeconds =
      nowSeconds + this.#options.accessTokenLifetimeMinutes * 60;
    const payload: JwtPayload = {
      iss: this.#options.issuer,
      aud: this.#options.audience,
      sub: claims.sub,
      iat: nowSeconds,
      exp: expSeconds,
      jti: `jti-${opaqueToken(8)}`,
      ...(claims.name === undefined ? {} : { name: claims.name }),
      ...(claims.githubId === undefined ? {} : { "gh:id": claims.githubId }),
      ...(claims.login === undefined ? {} : { "gh:login": claims.login }),
    };
    const header = {
      alg: "HS256",
      typ: "JWT",
      kid: this.#options.keyId,
    };

    const headerB64 = base64UrlEncodeJson(header);
    const payloadB64 = base64UrlEncodeJson(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = createHmac(
      "sha256",
      Buffer.from(this.#options.signingKey, "base64"),
    )
      .update(signingInput)
      .digest("base64url");

    return {
      accessToken: `${signingInput}.${signature}`,
      tokenType: "Bearer",
      expiresAt: new Date(expSeconds * 1_000).toISOString(),
    };
  }

  verify(token: string): JwtPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Malformed JWT: expected 3 parts.");
    }

    const [headerB64, payloadB64, signature] = parts;
    if (
      headerB64 === undefined ||
      payloadB64 === undefined ||
      signature === undefined
    ) {
      throw new Error("Malformed JWT: expected 3 parts.");
    }

    const expected = createHmac(
      "sha256",
      Buffer.from(this.#options.signingKey, "base64"),
    )
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (signature !== expected) {
      throw new Error("Invalid JWT signature.");
    }

    const header = parseBase64UrlJson(headerB64);
    if (header.alg !== "HS256") {
      throw new Error("Unsupported JWT algorithm.");
    }

    const payload = parseBase64UrlJson(payloadB64);
    if (payload.iss !== this.#options.issuer) {
      throw new Error("Invalid JWT issuer.");
    }
    if (payload.aud !== this.#options.audience) {
      throw new Error("Invalid JWT audience.");
    }
    if (typeof payload.exp !== "number") {
      throw new Error("JWT exp claim is required.");
    }

    const nowSeconds = Math.floor(this.#clock.now().getTime() / 1_000);
    if (payload.exp < nowSeconds) {
      throw new Error("JWT expired.");
    }

    return payload;
  }
}

export class OAuthStateStore {
  readonly #clock: FakeClock;
  readonly #stateLifetimeMilliseconds: number;
  readonly #records = new Map<string, OAuthStateRecord>();

  constructor(clock: FakeClock, lifetimeMinutes = 10) {
    this.#clock = clock;
    this.#stateLifetimeMilliseconds = lifetimeMinutes * 60_000;
  }

  create(returnPath?: string): OAuthStateRecord {
    const state = `state-${opaqueToken(16)}`;
    const codeVerifier = `verifier-${opaqueToken(24)}`;
    const codeChallenge = createHash("sha256")
      .update(codeVerifier, "ascii")
      .digest("base64url");
    const expiresAt = new Date(
      this.#clock.now().getTime() + this.#stateLifetimeMilliseconds,
    ).toISOString();

    const record: OAuthStateRecord = {
      state,
      codeVerifier,
      codeChallenge,
      expiresAt,
      ...(returnPath === undefined ? {} : { returnPath }),
    };

    this.#records.set(state, record);
    return record;
  }

  take(state: string): OAuthStateRecord | null {
    const record = this.#records.get(state);
    if (record === undefined) {
      return null;
    }

    this.#records.delete(state);
    if (Date.parse(record.expiresAt) <= this.#clock.now().getTime()) {
      return null;
    }

    return record;
  }
}

export class DeviceFlowStore {
  readonly #clock: FakeClock;
  readonly #records = new Map<
    string,
    {
      deviceCode: string;
      intervalSeconds: number;
      expiresAt: string;
      lastPollAt?: string;
    }
  >();

  constructor(clock: FakeClock) {
    this.#clock = clock;
  }

  create(
    deviceCode: string,
    ttlSeconds: number,
    intervalSeconds: number,
  ): string {
    const handle = `device-${opaqueToken(16)}`;
    const expiresAt = new Date(
      this.#clock.now().getTime() + ttlSeconds * 1_000,
    ).toISOString();

    this.#records.set(handle, {
      deviceCode,
      intervalSeconds,
      expiresAt,
    });
    return handle;
  }

  beginPoll(handle: string): DeviceFlowSession | null {
    const record = this.#records.get(handle);
    if (record === undefined) {
      return null;
    }

    if (Date.parse(record.expiresAt) <= this.#clock.now().getTime()) {
      this.#records.delete(handle);
      return null;
    }

    const now = this.#clock.now().getTime();
    const lastPollAt =
      record.lastPollAt === undefined
        ? undefined
        : Date.parse(record.lastPollAt);
    const earliestNextPoll =
      lastPollAt === undefined
        ? Number.NEGATIVE_INFINITY
        : lastPollAt + record.intervalSeconds * 1_000;
    const tooSoon = lastPollAt !== undefined && now < earliestNextPoll;

    if (!tooSoon) {
      record.lastPollAt = new Date(now).toISOString();
      this.#records.set(handle, record);
    }

    return {
      deviceCode: record.deviceCode,
      intervalSeconds: record.intervalSeconds,
      expiresAt: record.expiresAt,
      tooSoon,
    };
  }

  increaseInterval(handle: string, nextIntervalSeconds: number): void {
    const record = this.#records.get(handle);
    if (record === undefined) {
      return;
    }

    record.intervalSeconds = Math.max(
      record.intervalSeconds,
      nextIntervalSeconds,
    );
    this.#records.set(handle, record);
  }

  remove(handle: string): void {
    this.#records.delete(handle);
  }
}

export function loadOpenApiRouteMethods(): Map<string, readonly HttpMethod[]> {
  const fileUrl = new URL(
    "../../../../../services/Devngn.Wellness.Api/openapi/v1.json",
    import.meta.url,
  );
  const documentText = readFileSync(fileUrl, "utf8");
  const document = JSON.parse(documentText) as {
    readonly paths: Record<string, Record<string, unknown>>;
  };

  const routes = new Map<string, readonly HttpMethod[]>();
  for (const [path, entry] of Object.entries(document.paths)) {
    const methods = Object.keys(entry)
      .filter(isHttpMethod)
      .map((method) => method.toUpperCase() as HttpMethod)
      .sort();
    routes.set(path, methods);
  }

  return routes;
}

export function isSafeRelativePath(returnPath: string | null): boolean {
  if (returnPath === null || returnPath.length === 0) {
    return true;
  }

  return (
    returnPath.startsWith("/") &&
    !returnPath.startsWith("//") &&
    !returnPath.includes("://")
  );
}

function isHttpMethod(value: string): value is Lowercase<HttpMethod> {
  return ["get", "post", "put", "patch", "delete"].includes(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isExactOriginString(value: string): boolean {
  if (value.startsWith("tauri://")) {
    return value === "tauri://localhost";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return (
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson(value: string): JwtPayload & {
  readonly alg?: string;
} {
  const parsed = JSON.parse(
    Buffer.from(value, "base64url").toString("utf8"),
  ) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("JWT payload must decode to an object.");
  }

  return parsed as JwtPayload & { readonly alg?: string };
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (headers === undefined) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}

let opaqueCounter = 0;

function opaqueToken(bytes: number): string {
  const segments: string[] = [];
  while (segments.join("").length < bytes * 2) {
    opaqueCounter += 1;
    segments.push(opaqueCounter.toString(16).padStart(8, "0"));
  }
  return Buffer.from(segments.join("").slice(0, bytes * 2), "hex").toString(
    "base64url",
  );
}
