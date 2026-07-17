// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEVNGN_PRODUCTION_ORIGIN,
  TAURI_LOCALHOST,
  TAURI_WINDOWS_LOCALHOST,
  corsHeaders,
  handlePreflight,
  withCors,
} from "./support/referenceApi.js";

describe("CORS exact-origin allowlist", () => {
  it("allows each committed application origin exactly", () => {
    for (const origin of DEFAULT_ALLOWED_ORIGINS) {
      expect(corsHeaders(origin)).toEqual({
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      });
    }
  });

  it("rejects prefix, suffix, and scheme downgrade lookalikes", () => {
    expect(corsHeaders("tauri://localhost.evil.com")).toBeNull();
    expect(corsHeaders("https://tauri.localhost:3000")).toBeNull();
    expect(corsHeaders("https://evil.devngn.ai")).toBeNull();
    expect(corsHeaders("http://devngn.ai")).toBeNull();
  });

  it("does not emit CORS headers for a missing Origin header", () => {
    expect(corsHeaders(null)).toBeNull();
  });
});

describe("CORS preflight", () => {
  it("returns 204 and reflects the requesting allowed origin", () => {
    const response = handlePreflight(
      new Request("https://api.devngn.ai/v1/consent", {
        method: "OPTIONS",
        headers: {
          Origin: TAURI_WINDOWS_LOCALHOST,
          "Access-Control-Request-Method": "DELETE",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
      TAURI_WINDOWS_LOCALHOST,
    );
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain(
      "DELETE",
    );
    expect(response?.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(response?.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("returns 403 for a disallowed preflight origin", () => {
    const response = handlePreflight(
      new Request("https://api.devngn.ai/v1/goals", {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example.com" },
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("passes non-OPTIONS requests through untouched", () => {
    expect(
      handlePreflight(
        new Request("https://api.devngn.ai/v1/hello", { method: "GET" }),
      ),
    ).toBeNull();
  });
});

describe("CORS response headers", () => {
  it("adds Vary: Origin on allowed-origin responses", () => {
    const response = withCors(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      TAURI_LOCALHOST,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      TAURI_LOCALHOST,
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("leaves disallowed-origin responses unchanged", () => {
    const response = withCors(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      "https://blocked.example.com",
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("supports the production PWA origin explicitly", () => {
    const response = withCors(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      DEVNGN_PRODUCTION_ORIGIN,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      DEVNGN_PRODUCTION_ORIGIN,
    );
  });
});
