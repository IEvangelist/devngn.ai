// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { PromptResponse } from "@devngn/wellness-types";
import type { StreamHandlers, WellnessClient } from "@devngn/wellness-client";
import type { INotifier } from "./notifier.js";
import {
  renderPromptNotification,
  runWellnessDaemon,
  type DaemonLogger,
} from "./daemon.js";

function makePrompt(
  id: string,
  overrides: Partial<PromptResponse> = {},
): PromptResponse {
  return {
    id,
    activityId: "11111111-1111-1111-1111-111111111111",
    activitySlug: "shoulder-rolls",
    activityTitle: "Shoulder rolls",
    activityDescription: "Roll your shoulders backward slowly.",
    bodyArea: "Upper",
    intensity: "Low",
    durationSeconds: "30",
    equipmentTags: ["chair-only"],
    animationProvider: "lottie",
    animationAssetId: "asset-1",
    licenseAttribution: "CC0",
    steps: [],
    gapStartUtc: "2026-06-02T15:00:00Z",
    gapEndUtc: "2026-06-02T15:30:00Z",
    deliveredAt: "2026-06-02T15:00:00Z",
    deliveredVia: "Cli",
    dismissedAt: null,
    completedAt: null,
    feedbackRating: null,
    ...overrides,
  };
}

function makeLogger(): DaemonLogger {
  return { status: vi.fn(), prompt: vi.fn(), warn: vi.fn() };
}

function makeClient(): {
  client: WellnessClient;
  stop: ReturnType<typeof vi.fn>;
  getHandlers: () => StreamHandlers;
} {
  let handlers: StreamHandlers | undefined;
  const stop = vi.fn();
  const client = {
    streamPrompts: (h: StreamHandlers) => {
      handlers = h;
      return stop;
    },
  } as unknown as WellnessClient;
  return {
    client,
    stop,
    getHandlers: () => {
      if (handlers === undefined) {
        throw new Error("streamPrompts was not called");
      }
      return handlers;
    },
  };
}

describe("renderPromptNotification", () => {
  it("builds a title and a metadata-rich body, coercing the duration", () => {
    const message = renderPromptNotification(makePrompt("p1"));
    expect(message.title).toBe("Time to move: Shoulder rolls");
    expect(message.body).toBe(
      "Roll your shoulders backward slowly.\n~30s · Upper · Low",
    );
  });

  it("omits the duration when it is not positive", () => {
    const message = renderPromptNotification(
      makePrompt("p1", { durationSeconds: 0 }),
    );
    expect(message.body).toBe(
      "Roll your shoulders backward slowly.\nUpper · Low",
    );
  });
});

describe("runWellnessDaemon", () => {
  it("notifies on each delivered prompt", async () => {
    const { client, getHandlers } = makeClient();
    const notifier: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AbortController();

    const pending = runWellnessDaemon({
      client,
      notifier,
      log: makeLogger(),
      timeZone: "UTC",
      signal: controller.signal,
    });

    getHandlers().onPrompt(makePrompt("a"));
    getHandlers().onPrompt(makePrompt("b"));
    await Promise.resolve();

    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(notifier.notify).toHaveBeenCalledWith({
      title: "Time to move: Shoulder rolls",
      body: "Roll your shoulders backward slowly.\n~30s · Upper · Low",
    });

    controller.abort();
    expect((await pending).reason).toBe("aborted");
  });

  it("suppresses duplicate prompt ids", async () => {
    const { client, getHandlers } = makeClient();
    const notifier: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AbortController();

    const pending = runWellnessDaemon({
      client,
      notifier,
      log: makeLogger(),
      timeZone: "UTC",
      signal: controller.signal,
    });

    getHandlers().onPrompt(makePrompt("dup"));
    getHandlers().onPrompt(makePrompt("dup"));

    expect(notifier.notify).toHaveBeenCalledTimes(1);

    controller.abort();
    await pending;
  });

  it("stops and resolves once after the first prompt when once=true", async () => {
    const { client, stop, getHandlers } = makeClient();
    const notifier: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    const pending = runWellnessDaemon({
      client,
      notifier,
      log: makeLogger(),
      timeZone: "UTC",
      once: true,
    });

    getHandlers().onPrompt(makePrompt("a"));
    getHandlers().onPrompt(makePrompt("b"));

    const result = await pending;
    expect(result.reason).toBe("once");
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("resolves with the stop reason and tears down on an auth stop", async () => {
    const { client, stop, getHandlers } = makeClient();
    const notifier: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    const pending = runWellnessDaemon({
      client,
      notifier,
      log: makeLogger(),
      timeZone: "UTC",
    });

    getHandlers().onStop?.("unauthorized");

    expect((await pending).reason).toBe("unauthorized");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("resolves immediately when the signal is already aborted", async () => {
    const { client, stop } = makeClient();
    const notifier: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runWellnessDaemon({
      client,
      notifier,
      log: makeLogger(),
      timeZone: "UTC",
      signal: AbortSignal.abort(),
    });

    expect(result.reason).toBe("aborted");
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
