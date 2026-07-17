// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEVNGN_PRODUCTION_ORIGIN,
  FakeClock,
  ReferenceJwtService,
  validateJwtOptions,
  validateProductionConfig,
} from "./support/referenceApi.js";

const clock = new FakeClock("2026-07-10T15:00:00.000Z");
const signingKey = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString(
  "base64",
);

const jwtOptions = {
  issuer: "devngn.ai",
  audience: "wellness",
  signingKey,
  keyId: "kid-1",
  accessTokenLifetimeMinutes: 60,
} as const;

describe("JWT issue + verify", () => {
  it("issues an HS256 bearer token with the expected claims", () => {
    const service = new ReferenceJwtService(jwtOptions, clock);
    const issued = service.issue({
      sub: "550e8400-e29b-41d4-a716-446655440000",
      name: "Octo Dev",
      githubId: 4242,
      login: "octodev",
    });

    expect(issued.tokenType).toBe("Bearer");

    const [headerPart] = issued.accessToken.split(".");
    const header = JSON.parse(
      Buffer.from(headerPart ?? "", "base64url").toString("utf8"),
    );
    expect(header).toMatchObject({
      alg: "HS256",
      typ: "JWT",
      kid: "kid-1",
    });

    const payload = service.verify(issued.accessToken);
    expect(payload).toMatchObject({
      iss: "devngn.ai",
      aud: "wellness",
      sub: "550e8400-e29b-41d4-a716-446655440000",
      name: "Octo Dev",
      "gh:id": 4242,
      "gh:login": "octodev",
    });
    expect(payload.exp - payload.iat).toBe(60 * 60);
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it("rejects a token signed with a different key", () => {
    const issuer = new ReferenceJwtService(jwtOptions, clock);
    const verifier = new ReferenceJwtService(
      {
        ...jwtOptions,
        signingKey: Buffer.from(
          "fedcba9876543210fedcba9876543210",
          "utf8",
        ).toString("base64"),
      },
      clock,
    );

    const issued = issuer.issue({
      sub: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(() => verifier.verify(issued.accessToken)).toThrow(/signature/i);
  });

  it("rejects a token whose audience does not match", () => {
    const issuer = new ReferenceJwtService(jwtOptions, clock);
    const verifier = new ReferenceJwtService(
      {
        ...jwtOptions,
        audience: "wrong-audience",
      },
      clock,
    );

    const issued = issuer.issue({
      sub: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(() => verifier.verify(issued.accessToken)).toThrow(/audience/i);
  });

  it("rejects an expired token", () => {
    const issueClock = new FakeClock("2026-07-10T12:00:00.000Z");
    const verifyClock = new FakeClock("2026-07-10T15:30:00.000Z");
    const issuer = new ReferenceJwtService(jwtOptions, issueClock);
    const verifier = new ReferenceJwtService(jwtOptions, verifyClock);

    const issued = issuer.issue({
      sub: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(() => verifier.verify(issued.accessToken)).toThrow(/expired/i);
  });

  it("rejects structurally malformed tokens", () => {
    const service = new ReferenceJwtService(jwtOptions, clock);
    expect(() => service.verify("not-a-jwt")).toThrow(/3 parts/i);
  });
});

describe("production config validation", () => {
  it("accepts the committed production shape: exact origins + valid JWT/GitHub config", () => {
    const result = validateProductionConfig({
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
      jwt: jwtOptions,
      github: {
        clientId: "client-id",
        clientSecret: "client-secret",
        deviceCodeEndpoint: "https://github.com/login/device/code",
        accessTokenEndpoint: "https://github.com/login/oauth/access_token",
        authorizeEndpoint: "https://github.com/login/oauth/authorize",
        userEndpoint: "https://api.github.com/user",
        webCallbackPath: "/v1/auth/github/web/callback",
        userAgent: "devngn.ai-wellness/1.0",
      },
    });

    expect(result).toEqual([]);
    expect(DEFAULT_ALLOWED_ORIGINS).toContain(DEVNGN_PRODUCTION_ORIGIN);
  });

  it("rejects invalid JWT signing-key configuration", () => {
    expect(
      validateJwtOptions({
        ...jwtOptions,
        signingKey: Buffer.from("short-key", "utf8").toString("base64"),
      }),
    ).toContainEqual(expect.stringContaining("at least 32 bytes"));
  });

  it("rejects wildcard CORS in production", () => {
    const result = validateProductionConfig({
      allowedOrigins: ["*"],
      jwt: jwtOptions,
      github: {
        clientId: "client-id",
        clientSecret: "client-secret",
        deviceCodeEndpoint: "https://github.com/login/device/code",
        accessTokenEndpoint: "https://github.com/login/oauth/access_token",
        authorizeEndpoint: "https://github.com/login/oauth/authorize",
        userEndpoint: "https://api.github.com/user",
        webCallbackPath: "/v1/auth/github/web/callback",
        userAgent: "devngn.ai-wellness/1.0",
      },
    });

    expect(result).toContain("allowedOrigins must not contain '*'.");
  });
});
