import type { JwtConfiguration } from "./config.js";
import { isObject, isString } from "./json.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  nbf?: number;
  iss?: string;
  aud?: string;
  jti?: string;
  login?: string;
  name?: string;
  "gh:id"?: number | string;
  "gh:login"?: string;
}

export type JwtClaims = Omit<JwtPayload, "iat" | "exp">;

export interface JwtService {
  sign(claims: JwtClaims): Promise<string>;
  verify(token: string): Promise<JwtPayload>;
}

export class JwtValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtValidationError";
  }
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(encoder.encode(JSON.stringify(value)));
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new JwtValidationError("Malformed JWT encoding.");
  }
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch (error: unknown) {
    if (error instanceof DOMException) {
      throw new JwtValidationError("Malformed JWT encoding.");
    }
    throw error;
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(decoder.decode(base64UrlDecode(value)));
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new JwtValidationError("Malformed JWT JSON.");
    }
    throw error;
  }
}

function readPayload(value: unknown): JwtPayload {
  if (!isObject(value)) {
    throw new JwtValidationError("Malformed JWT payload.");
  }
  const sub = value.sub;
  const iat = value.iat;
  const exp = value.exp;
  if (
    !isString(sub) ||
    typeof iat !== "number" ||
    !Number.isFinite(iat) ||
    typeof exp !== "number" ||
    !Number.isFinite(exp)
  ) {
    throw new JwtValidationError("JWT payload is missing required claims.");
  }

  const payload: JwtPayload = { sub, iat, exp };
  if (typeof value.nbf === "number" && Number.isFinite(value.nbf)) {
    payload.nbf = value.nbf;
  }
  if (isString(value.iss)) payload.iss = value.iss;
  if (isString(value.aud)) payload.aud = value.aud;
  if (isString(value.jti)) payload.jti = value.jti;
  if (isString(value.login)) payload.login = value.login;
  if (isString(value.name)) payload.name = value.name;
  if (typeof value["gh:id"] === "number" || isString(value["gh:id"])) {
    payload["gh:id"] = value["gh:id"];
  }
  if (isString(value["gh:login"])) payload["gh:login"] = value["gh:login"];
  return payload;
}

function normalizeConfiguration(
  secretOrConfiguration: string | JwtConfiguration,
): JwtConfiguration {
  if (typeof secretOrConfiguration === "string") {
    return {
      secret: secretOrConfiguration,
      secretEncoding: "utf8",
      issuer: "",
      audience: "",
      lifetimeSeconds: 30 * 24 * 60 * 60,
      keyId: "v1",
      clockSkewSeconds: 0,
    };
  }
  return secretOrConfiguration;
}

function keyMaterial(
  secret: string,
  encoding: JwtConfiguration["secretEncoding"],
): ArrayBuffer {
  if (encoding === "utf8") {
    return copyToArrayBuffer(encoder.encode(secret));
  }
  let decoded: string;
  try {
    decoded = atob(secret);
  } catch (error: unknown) {
    if (error instanceof DOMException) {
      throw new JwtValidationError("JWT signing key is not valid base64.");
    }
    throw error;
  }
  return copyToArrayBuffer(
    Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
  );
}

async function importSigningKey(
  secret: string,
  encoding: JwtConfiguration["secretEncoding"],
  usages: KeyUsage[],
): Promise<CryptoKey> {
  if (secret.trim().length === 0) {
    throw new Error(
      "WELLNESS_JWT_SECRET is not configured. Set JWT_SECRET in the Netlify runtime environment.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    keyMaterial(secret, encoding),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return base64UrlEncodeBytes(bytes);
}

/**
 * Creates an HS256 JWT issuer/validator. Passing a string is intentionally kept
 * for pure unit tests; production callers pass a fully validated JwtConfiguration.
 */
export function createJwtService(
  secretOrConfiguration: string | JwtConfiguration,
  now: () => Date = () => new Date(),
): JwtService {
  const configuration = normalizeConfiguration(secretOrConfiguration);
  if (configuration.secret.trim().length === 0) {
    throw new Error(
      "WELLNESS_JWT_SECRET is not configured. Set JWT_SECRET in the Netlify runtime environment.",
    );
  }

  return {
    async sign(claims: JwtClaims): Promise<string> {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const payload: JwtPayload = {
        ...claims,
        iat: issuedAt,
        nbf: issuedAt,
        exp: issuedAt + configuration.lifetimeSeconds,
        ...(configuration.issuer.length === 0
          ? {}
          : { iss: configuration.issuer }),
        ...(configuration.audience.length === 0
          ? {}
          : { aud: configuration.audience }),
        ...(claims.jti === undefined ? { jti: randomId() } : {}),
      };
      const header = {
        alg: "HS256",
        typ: "JWT",
        ...(configuration.keyId.length === 0
          ? {}
          : { kid: configuration.keyId }),
      };
      const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
      const key = await importSigningKey(
        configuration.secret,
        configuration.secretEncoding,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signingInput),
      );
      return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
    },

    async verify(token: string): Promise<JwtPayload> {
      const parts = token.split(".");
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
        throw new JwtValidationError("Malformed JWT: expected 3 parts.");
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const header = decodeJson(encodedHeader!);
      if (!isObject(header) || header.alg !== "HS256") {
        throw new JwtValidationError("Unsupported JWT algorithm.");
      }

      const key = await importSigningKey(
        configuration.secret,
        configuration.secretEncoding,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        copyToArrayBuffer(base64UrlDecode(encodedSignature!)),
        encoder.encode(`${encodedHeader}.${encodedPayload}`),
      );
      if (!valid) {
        throw new JwtValidationError("Invalid JWT signature.");
      }

      const payload = readPayload(decodeJson(encodedPayload!));
      const current = Math.floor(now().getTime() / 1000);
      const skew = configuration.clockSkewSeconds ?? 0;
      if (payload.exp + skew < current) {
        throw new JwtValidationError("JWT expired.");
      }
      if (payload.nbf !== undefined && payload.nbf - skew > current) {
        throw new JwtValidationError("JWT is not active.");
      }
      if (
        configuration.issuer.length > 0 &&
        payload.iss !== configuration.issuer
      ) {
        throw new JwtValidationError("JWT issuer is invalid.");
      }
      if (
        configuration.audience.length > 0 &&
        payload.aud !== configuration.audience
      ) {
        throw new JwtValidationError("JWT audience is invalid.");
      }
      return payload;
    },
  };
}
