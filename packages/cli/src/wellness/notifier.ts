// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { spawn as nodeSpawn } from "node:child_process";

/** A movement-break notification ready to surface to the developer. */
export interface NotificationMessage {
  readonly title: string;
  readonly body: string;
}

/** Raises a notification. Implementations must never throw. */
export interface INotifier {
  notify(message: NotificationMessage): Promise<void>;
}

/** The platform command + injection-safe arguments/environment to raise a toast. */
export interface NotifyCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** Minimal child-process surface used by {@link SpawnNotifier} (injectable for tests). */
export interface SpawnedProcess {
  on(
    event: "spawn" | "error" | "exit",
    listener: (...args: unknown[]) => void,
  ): void;
  unref?(): void;
}

export interface NotifierSpawnOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: "ignore";
  readonly windowsHide: boolean;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: NotifierSpawnOptions,
) => SpawnedProcess;

// PowerShell that shows a dependency-free balloon toast on Windows. Title/body are
// read from the environment (never interpolated) so prompt text can't inject script.
const WINDOWS_TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  "$notify = New-Object System.Windows.Forms.NotifyIcon",
  "$notify.Icon = [System.Drawing.SystemIcons]::Information",
  "$notify.BalloonTipTitle = $env:DEVNGN_TOAST_TITLE",
  "$notify.BalloonTipText = $env:DEVNGN_TOAST_BODY",
  "$notify.Visible = $true",
  "$notify.ShowBalloonTip(5000)",
  "Start-Sleep -Milliseconds 5500",
  "$notify.Dispose()",
].join("; ");

// AppleScript reads the title/body via `system attribute` (env vars) so prompt text
// is never spliced into the script string.
const MACOS_SCRIPT =
  'display notification (system attribute "DEVNGN_TOAST_BODY") with title (system attribute "DEVNGN_TOAST_TITLE")';

/** Guards a `notify-send` positional arg whose leading `-` could be parsed as an option. */
function safePositional(value: string): string {
  return value.startsWith("-") ? `\u00a0${value}` : value;
}

/**
 * Builds the OS-native notification command for `platform`, or `null` when the
 * platform has no supported command (callers fall back to the console). Title and
 * body are passed via environment variables (macOS/Windows) or separate argv
 * entries (Linux), never interpolated into a shell string.
 */
export function buildNotifyCommand(
  platform: NodeJS.Platform,
  message: NotificationMessage,
): NotifyCommand | null {
  const env = {
    DEVNGN_TOAST_TITLE: message.title,
    DEVNGN_TOAST_BODY: message.body,
  };

  switch (platform) {
    case "darwin":
      return { command: "osascript", args: ["-e", MACOS_SCRIPT], env };
    case "linux":
      return {
        command: "notify-send",
        args: [
          "-a",
          "devngn",
          safePositional(message.title),
          safePositional(message.body),
        ],
        env: {},
      };
    case "win32":
      return {
        command: "powershell",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_TOAST_SCRIPT,
        ],
        env,
      };
    default:
      return null;
  }
}

/** Writes notifications to a text sink (default stdout); the universal fallback. */
export class ConsoleNotifier implements INotifier {
  private readonly write: (line: string) => void;

  constructor(
    write: (line: string) => void = (line) => process.stdout.write(line),
  ) {
    this.write = write;
  }

  notify(message: NotificationMessage): Promise<void> {
    const body = message.body.replace(/\n/g, " ");
    this.write(`\n🧘 ${message.title}${body ? ` — ${body}` : ""}\n`);
    return Promise.resolve();
  }
}

export interface SpawnNotifierConfig {
  readonly platform?: NodeJS.Platform;
  readonly spawn?: SpawnFn;
  readonly fallback?: INotifier;
}

/**
 * Raises OS notifications by shelling out to the platform's native tool
 * (`osascript` / `notify-send` / PowerShell) with no third-party dependency. It
 * resolves once the child has spawned — deliberately not awaiting the toast's
 * multi-second UI lifetime — and transparently falls back to {@link ConsoleNotifier}
 * when there is no supported command or the spawn fails. It never throws.
 */
export class SpawnNotifier implements INotifier {
  private readonly platform: NodeJS.Platform;
  private readonly spawn: SpawnFn;
  private readonly fallback: INotifier;

  constructor(config: SpawnNotifierConfig = {}) {
    this.platform = config.platform ?? process.platform;
    this.spawn =
      config.spawn ??
      ((command, args, options) =>
        nodeSpawn(command, [...args], options) as unknown as SpawnedProcess);
    this.fallback = config.fallback ?? new ConsoleNotifier();
  }

  notify(message: NotificationMessage): Promise<void> {
    const built = buildNotifyCommand(this.platform, message);
    if (built === null) {
      return this.fallback.notify(message);
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const fallBack = (): void => {
        void this.fallback.notify(message).finally(settle);
      };

      let child: SpawnedProcess;
      try {
        child = this.spawn(built.command, built.args, {
          env: { ...process.env, ...built.env },
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        fallBack();
        return;
      }

      child.unref?.();
      child.on("error", fallBack);
      child.on("spawn", settle);

      // Safety net: resolve even if neither event fires (e.g. a stubbed child).
      const timer = setTimeout(settle, 2_000);
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
      }
    });
  }
}

/** The default notifier for the daemon: native toasts with a console fallback. */
export function createDefaultNotifier(): INotifier {
  return new SpawnNotifier({ fallback: new ConsoleNotifier() });
}
