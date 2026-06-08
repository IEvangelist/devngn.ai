// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  buildNotifyCommand,
  ConsoleNotifier,
  SpawnNotifier,
  type INotifier,
  type NotificationMessage,
  type SpawnedProcess,
} from "./notifier.js";

const message: NotificationMessage = {
  title: "Time to move",
  body: "Roll shoulders",
};

interface FakeChild extends SpawnedProcess {
  emit(event: "spawn" | "error" | "exit", ...args: unknown[]): void;
}

function makeChild(): FakeChild {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    on(event, listener) {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    },
    unref() {},
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
}

describe("buildNotifyCommand", () => {
  it("uses osascript with env-injected title/body on macOS", () => {
    const built = buildNotifyCommand("darwin", message);
    expect(built?.command).toBe("osascript");
    expect(built?.args[0]).toBe("-e");
    expect(built?.args[1]).toContain("system attribute");
    expect(built?.env.DEVNGN_TOAST_TITLE).toBe("Time to move");
    expect(built?.env.DEVNGN_TOAST_BODY).toBe("Roll shoulders");
  });

  it("uses notify-send with positional args on Linux", () => {
    const built = buildNotifyCommand("linux", message);
    expect(built?.command).toBe("notify-send");
    expect(built?.args).toEqual([
      "-a",
      "devngn",
      "Time to move",
      "Roll shoulders",
    ]);
  });

  it("guards a Linux positional that begins with a dash", () => {
    const built = buildNotifyCommand("linux", {
      title: "-rm",
      body: "-x body",
    });
    expect(built?.args).toEqual(["-a", "devngn", "\u00a0-rm", "\u00a0-x body"]);
  });

  it("uses PowerShell reading env vars on Windows", () => {
    const built = buildNotifyCommand("win32", message);
    expect(built?.command).toBe("powershell");
    expect(built?.args).toContain("-NoProfile");
    expect(built?.args.at(-1)).toContain("$env:DEVNGN_TOAST_TITLE");
    expect(built?.env.DEVNGN_TOAST_BODY).toBe("Roll shoulders");
  });

  it("returns null for unsupported platforms", () => {
    expect(
      buildNotifyCommand("freebsd" as NodeJS.Platform, message),
    ).toBeNull();
  });
});

describe("ConsoleNotifier", () => {
  it("writes a single-line message to the sink", async () => {
    const lines: string[] = [];
    await new ConsoleNotifier((line) => lines.push(line)).notify({
      title: "T",
      body: "a\nb",
    });
    expect(lines.join("")).toContain("T — a b");
  });
});

describe("SpawnNotifier", () => {
  it("spawns the platform command and resolves once launched", async () => {
    const child = makeChild();
    const spawn = vi.fn(() => child);
    const fallback: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = new SpawnNotifier({ platform: "linux", spawn, fallback });

    const pending = notifier.notify(message);
    child.emit("spawn");
    await pending;

    expect(spawn).toHaveBeenCalledWith(
      "notify-send",
      ["-a", "devngn", "Time to move", "Roll shoulders"],
      expect.objectContaining({ stdio: "ignore", windowsHide: true }),
    );
    expect(fallback.notify).not.toHaveBeenCalled();
  });

  it("falls back to the console notifier when the child errors", async () => {
    const child = makeChild();
    const fallback: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = new SpawnNotifier({
      platform: "linux",
      spawn: () => child,
      fallback,
    });

    const pending = notifier.notify(message);
    child.emit("error", new Error("notify-send missing"));
    await pending;

    expect(fallback.notify).toHaveBeenCalledWith(message);
  });

  it("uses the fallback directly on unsupported platforms", async () => {
    const spawn = vi.fn(() => makeChild());
    const fallback: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = new SpawnNotifier({
      platform: "freebsd" as NodeJS.Platform,
      spawn,
      fallback,
    });

    await notifier.notify(message);

    expect(spawn).not.toHaveBeenCalled();
    expect(fallback.notify).toHaveBeenCalledWith(message);
  });

  it("falls back when spawning throws synchronously", async () => {
    const fallback: INotifier = {
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = new SpawnNotifier({
      platform: "linux",
      spawn: () => {
        throw new Error("EACCES");
      },
      fallback,
    });

    await notifier.notify(message);

    expect(fallback.notify).toHaveBeenCalledWith(message);
  });
});
