// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type {
  AccessTokenResponse,
  DeviceFlowStartResponse,
} from "@devngn/wellness-types";
import type { DevicePollResult, WellnessClient } from "@devngn/wellness-client";
import { runDeviceFlowLogin, type SignInLogger } from "./signIn.js";

const start: DeviceFlowStartResponse = {
  sessionId: "session-1",
  userCode: "WXYZ-1234",
  verificationUri: "https://github.com/login/device",
  expiresInSeconds: 300,
  intervalSeconds: 0,
};

const token: AccessTokenResponse = {
  accessToken: "jwt-abc",
  tokenType: "Bearer",
  expiresAt: "2999-01-01T00:00:00Z",
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    gitHubId: 42,
    login: "octocat",
    displayName: "The Octocat",
    avatarUrl: null,
  },
};

function makeClient(polls: DevicePollResult[]): {
  client: WellnessClient;
  poll: ReturnType<typeof vi.fn>;
} {
  const queue = [...polls];
  const poll = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("unexpected extra poll");
    }
    return next;
  });
  const client = {
    startDeviceFlow: vi.fn(async () => start),
    pollDeviceFlow: poll,
  } as unknown as WellnessClient;
  return { client, poll };
}

function makeLogger(): SignInLogger {
  return { info: vi.fn(), error: vi.fn() };
}

const deps = {
  log: makeLogger(),
  now: () => 0,
  sleep: async () => undefined,
};

describe("runDeviceFlowLogin", () => {
  it("returns a session on a successful poll", async () => {
    const { client } = makeClient([{ kind: "success", token }]);

    const session = await runDeviceFlowLogin(client, {
      ...deps,
      log: makeLogger(),
    });

    expect(session).toEqual({
      accessToken: "jwt-abc",
      tokenType: "Bearer",
      expiresAt: "2999-01-01T00:00:00Z",
      login: "octocat",
    });
  });

  it("keeps polling while pending then succeeds", async () => {
    const { client, poll } = makeClient([
      { kind: "pending" },
      { kind: "slowDown", retryAfterSeconds: 1 },
      { kind: "success", token },
    ]);

    const session = await runDeviceFlowLogin(client, {
      ...deps,
      log: makeLogger(),
    });

    expect(poll).toHaveBeenCalledTimes(3);
    expect(session?.login).toBe("octocat");
  });

  it("returns null and logs when the flow errors", async () => {
    const { client } = makeClient([
      { kind: "error", error: "access_denied", description: "User cancelled" },
    ]);
    const log = makeLogger();

    const session = await runDeviceFlowLogin(client, { ...deps, log });

    expect(session).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      "Sign-in failed: access_denied (User cancelled)",
    );
  });

  it("returns null when the deadline passes before authorization", async () => {
    const { client, poll } = makeClient([]);
    const clock = [0, 10_000_000];
    const log = makeLogger();

    const session = await runDeviceFlowLogin(client, {
      log,
      now: () => clock.shift() ?? 10_000_000,
      sleep: async () => undefined,
    });

    expect(session).toBeNull();
    expect(poll).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "Sign-in timed out. Please try again.",
    );
  });

  it("returns null when the signal is already aborted", async () => {
    const { client, poll } = makeClient([]);

    const session = await runDeviceFlowLogin(client, {
      ...deps,
      log: makeLogger(),
      signal: AbortSignal.abort(),
    });

    expect(session).toBeNull();
    expect(poll).not.toHaveBeenCalled();
  });
});
