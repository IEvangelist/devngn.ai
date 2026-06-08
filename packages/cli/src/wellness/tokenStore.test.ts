// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredSession } from "@devngn/wellness-client";
import {
  createFileTokenSource,
  deleteSession,
  readSession,
  readSessionSync,
  wellnessSessionPath,
  writeSession,
} from "./tokenStore.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "devngn-token-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeSession(expiresAt: string): StoredSession {
  return {
    accessToken: "jwt-123",
    tokenType: "Bearer",
    expiresAt,
    login: "octocat",
  };
}

describe("wellnessSessionPath", () => {
  it("nests the session under a wellness folder in the state dir", () => {
    expect(wellnessSessionPath(path.join("state"))).toBe(
      path.join("state", "wellness", "session.json"),
    );
  });
});

describe("session round-trip", () => {
  it("writes atomically and reads back the session", async () => {
    const file = wellnessSessionPath(tempDir());
    const session = makeSession("2999-01-01T00:00:00Z");

    await writeSession(file, session);

    expect(await readSession(file)).toEqual(session);
    expect(readSessionSync(file)).toEqual(session);
    // The temp sibling used for the atomic rename is cleaned up.
    expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true);
  });

  it("returns null for a missing file", async () => {
    const file = wellnessSessionPath(tempDir());
    expect(await readSession(file)).toBeNull();
    expect(readSessionSync(file)).toBeNull();
  });

  it("returns null for malformed or incomplete JSON", async () => {
    const dir = tempDir();
    const bad = path.join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(readSessionSync(bad)).toBeNull();

    const partial = path.join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({ accessToken: "x" }));
    expect(readSessionSync(partial)).toBeNull();
  });
});

describe("deleteSession", () => {
  it("removes an existing session and tolerates a missing one", async () => {
    const file = wellnessSessionPath(tempDir());
    await writeSession(file, makeSession("2999-01-01T00:00:00Z"));

    await deleteSession(file);
    expect(await readSession(file)).toBeNull();

    // Second delete must not throw.
    await expect(deleteSession(file)).resolves.toBeUndefined();
  });
});

describe("createFileTokenSource", () => {
  it("returns the token while the session is usable", async () => {
    const file = wellnessSessionPath(tempDir());
    await writeSession(file, makeSession("2999-01-01T00:00:00Z"));
    expect(createFileTokenSource(file).getToken()).toBe("jwt-123");
  });

  it("returns undefined for an expired session", async () => {
    const file = wellnessSessionPath(tempDir());
    await writeSession(file, makeSession("2000-01-01T00:00:00Z"));
    expect(createFileTokenSource(file).getToken()).toBeUndefined();
  });

  it("returns undefined when no session is stored", () => {
    const file = wellnessSessionPath(tempDir());
    expect(createFileTokenSource(file).getToken()).toBeUndefined();
  });

  it("observes a logout that happens after construction", async () => {
    const file = wellnessSessionPath(tempDir());
    await writeSession(file, makeSession("2999-01-01T00:00:00Z"));
    const source = createFileTokenSource(file);
    expect(source.getToken()).toBe("jwt-123");

    await deleteSession(file);
    expect(source.getToken()).toBeUndefined();
  });
});
