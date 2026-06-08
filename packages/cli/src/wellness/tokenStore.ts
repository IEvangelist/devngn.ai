// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isSessionUsable, type StoredSession } from "@devngn/wellness-client";

/** Returns the canonical path of the persisted wellness session under the state dir. */
export function wellnessSessionPath(stateDirectory: string): string {
  return path.join(stateDirectory, "wellness", "session.json");
}

/**
 * A bearer-token source backed by the on-disk session. `getToken` re-reads the
 * file on every call so a concurrent `login`/`logout` is observed immediately, and
 * returns `undefined` once the token is missing or within the expiry skew window.
 */
export interface TokenSource {
  getToken(): string | undefined;
}

function parseSession(raw: string): StoredSession | null {
  let data: Partial<StoredSession>;
  try {
    data = JSON.parse(raw) as Partial<StoredSession>;
  } catch {
    return null;
  }
  if (
    typeof data.accessToken === "string" &&
    typeof data.tokenType === "string" &&
    typeof data.expiresAt === "string"
  ) {
    return {
      accessToken: data.accessToken,
      tokenType: data.tokenType,
      expiresAt: data.expiresAt,
      login: typeof data.login === "string" ? data.login : undefined,
    };
  }
  return null;
}

/** Reads and validates the stored session, or `null` if absent/unreadable/malformed. */
export async function readSession(file: string): Promise<StoredSession | null> {
  try {
    return parseSession(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Synchronous variant of {@link readSession} for hot paths like `getToken`. */
export function readSessionSync(file: string): StoredSession | null {
  try {
    return parseSession(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Atomically persists the session: it writes a sibling temp file (so a concurrent
 * reader never sees a half-written file), tightens its permissions where the OS
 * supports it, then renames it into place.
 */
export async function writeSession(
  file: string,
  session: StoredSession,
): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.session.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await chmod(temp, 0o600);
  } catch {
    // chmod is a no-op / unsupported on some platforms (e.g. Windows); ignore.
  }
  await rename(temp, file);
}

/** Removes the stored session. Missing file is treated as already signed out. */
export async function deleteSession(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/** Builds a {@link TokenSource} that reads `file` fresh on every `getToken`. */
export function createFileTokenSource(file: string): TokenSource {
  return {
    getToken: () => {
      const session = readSessionSync(file);
      if (session === null) {
        return undefined;
      }
      return isSessionUsable(session, Date.now())
        ? session.accessToken
        : undefined;
    },
  };
}
