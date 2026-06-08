// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import * as vscode from "vscode";
import type { PromptResponse } from "@devngn/wellness-types";
import {
  WellnessAuthError,
  WellnessClient,
  type StreamStatus,
  type StreamStopReason,
} from "./client.js";
import { isSessionUsable, type StoredSession } from "./session.js";
import { runDeviceFlowSignIn } from "./signIn.js";
import { openPromptPreview, presentPrompt } from "./ui.js";

const SECRET_KEY = "devngn.wellness.session";
const DEFAULT_API_URL = "http://localhost:5000";
/** How long a prompt id is suppressed from re-display (reconnect dedupe). */
const DEDUPE_TTL_MS = 10 * 60 * 1000;

/**
 * Registers the wellness prompt-delivery integration: a status-bar control, the
 * SSE subscription lifecycle (the kill switch), GitHub device-flow sign-in backed
 * by secret storage, and the prompt toast/preview UX. Everything is disposed via
 * `context.subscriptions`.
 */
export function activateWellness(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("devngn wellness");
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  );

  let session: StoredSession | null = null;
  let stopStream: (() => void) | null = null;
  let signingIn = false;
  const recentPromptIds = new Map<string, number>();

  const config = (): vscode.WorkspaceConfiguration =>
    vscode.workspace.getConfiguration("devngn.wellness");

  const baseUrl = (): string => {
    const value = config().get<string>("apiUrl", DEFAULT_API_URL);
    return value.trim() === "" ? DEFAULT_API_URL : value.trim();
  };

  const timeZone = (): string => {
    const value = config().get<string>("timeZone", "");
    if (value.trim() !== "") {
      return value.trim();
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  };

  const getToken = (): string | undefined => {
    const envToken = process.env.DEVNGN_WELLNESS_TOKEN;
    if (envToken !== undefined && envToken.trim() !== "") {
      return envToken.trim();
    }
    if (session !== null && isSessionUsable(session, Date.now())) {
      return session.accessToken;
    }
    return undefined;
  };

  const makeClient = (): WellnessClient =>
    new WellnessClient({ baseUrl: baseUrl(), getToken });

  const updateStatus = (state: StreamStatus | "signedOut" | "idle"): void => {
    switch (state) {
      case "open":
        statusBar.text = "$(pulse) wellness";
        statusBar.tooltip = "Wellness prompts: connected. Click to stop.";
        statusBar.command = "devngn.wellness.stop";
        break;
      case "connecting":
      case "reconnecting":
        statusBar.text = "$(sync~spin) wellness";
        statusBar.tooltip = `Wellness prompts: ${state}…`;
        statusBar.command = "devngn.wellness.stop";
        break;
      case "signedOut":
        statusBar.text = "$(account) wellness";
        statusBar.tooltip = "Wellness: sign in to receive movement prompts.";
        statusBar.command = "devngn.wellness.signIn";
        break;
      default:
        statusBar.text = "$(circle-slash) wellness";
        statusBar.tooltip = "Wellness prompts: off. Click to start.";
        statusBar.command = "devngn.wellness.start";
        break;
    }
    statusBar.show();
  };

  const log = (message: string): void =>
    output.appendLine(`[${new Date().toISOString()}] ${message}`);

  const onFatal = (reason: StreamStopReason): void => {
    // Abort any still-open stream before clearing the handle. onFatal is reached
    // both from the stream's own onStop AND from a REST 401 while the stream is
    // still live, so we must not just drop the stop handle and leak the loop.
    const currentStop = stopStream;
    stopStream = null;
    currentStop?.();

    if (reason === "unauthorized") {
      updateStatus("signedOut");
      void vscode.window
        .showWarningMessage(
          "Wellness session expired. Sign in again to keep receiving prompts.",
          "Sign in",
        )
        .then((choice) => {
          if (choice === "Sign in") {
            void signIn();
          }
        });
    } else {
      updateStatus("idle");
      void vscode.window.showWarningMessage(
        "Wellness prompts are paused: this account hasn't accepted the wellness consent yet.",
      );
    }
  };

  const runLifecycle = async (
    action: () => Promise<PromptResponse | undefined>,
    verb: string,
  ): Promise<void> => {
    try {
      const updated = await action();
      if (updated === undefined) {
        void vscode.window.showWarningMessage(
          `That wellness prompt is no longer available to ${verb}.`,
        );
      }
    } catch (error) {
      if (error instanceof WellnessAuthError) {
        onFatal("unauthorized");
        return;
      }
      log(`Failed to ${verb} prompt: ${describe(error)}`);
      void vscode.window.showErrorMessage(
        `Could not ${verb} the wellness prompt: ${describe(error)}`,
      );
    }
  };

  const handlePrompt = (
    client: WellnessClient,
    prompt: PromptResponse,
    options: { dedupe: boolean } = { dedupe: true },
  ): void => {
    const now = Date.now();
    for (const [id, shownAt] of recentPromptIds) {
      if (now - shownAt > DEDUPE_TTL_MS) {
        recentPromptIds.delete(id);
      }
    }
    if (options.dedupe && recentPromptIds.has(prompt.id)) {
      return;
    }
    recentPromptIds.set(prompt.id, now);

    log(`Prompt delivered: ${prompt.activityTitle} (${prompt.id})`);
    void presentPrompt(prompt, {
      complete: (id) => runLifecycle(() => client.complete(id), "complete"),
      dismiss: (id) => runLifecycle(() => client.dismiss(id), "dismiss"),
      preview: (delivered) => openPromptPreview(delivered),
    });
  };

  const start = async (): Promise<void> => {
    if (stopStream !== null) {
      void vscode.window.showInformationMessage(
        "Wellness prompts are already running.",
      );
      return;
    }
    if (getToken() === undefined) {
      const choice = await vscode.window.showInformationMessage(
        "Sign in to start receiving wellness prompts.",
        "Sign in",
        "Cancel",
      );
      if (choice === "Sign in") {
        await signIn();
      }
      if (getToken() === undefined) {
        updateStatus("signedOut");
        return;
      }
    }

    const client = makeClient();
    log(`Connecting to ${baseUrl()} …`);
    updateStatus("connecting");
    stopStream = client.streamPrompts(
      {
        onPrompt: (prompt) => handlePrompt(client, prompt),
        onStatus: (status) => {
          if (status !== "stopped" && stopStream !== null) {
            updateStatus(status);
          }
        },
        onStop: (reason) => onFatal(reason),
        onTransientError: (error) =>
          log(`Stream error (will retry): ${describe(error)}`),
      },
      { timeZone: timeZone() },
    );
  };

  const stop = (): void => {
    if (stopStream !== null) {
      stopStream();
      stopStream = null;
      log("Stopped.");
    }
    updateStatus(getToken() === undefined ? "signedOut" : "idle");
  };

  const signIn = async (): Promise<void> => {
    if (signingIn) {
      void vscode.window.showInformationMessage(
        "A wellness sign-in is already in progress.",
      );
      return;
    }
    signingIn = true;
    try {
      const result = await runDeviceFlowSignIn(makeClient());
      if (result === null) {
        return;
      }
      session = result;
      await context.secrets.store(SECRET_KEY, JSON.stringify(result));
      void vscode.window.showInformationMessage(
        `Signed in to wellness${result.login ? ` as ${result.login}` : ""}.`,
      );
      if (stopStream === null) {
        await start();
      }
    } finally {
      signingIn = false;
    }
  };

  const signOut = async (): Promise<void> => {
    session = null;
    await context.secrets.delete(SECRET_KEY);
    if (stopStream !== null) {
      stopStream();
      stopStream = null;
    }
    recentPromptIds.clear();
    updateStatus("signedOut");
    void vscode.window.showInformationMessage("Signed out of wellness.");
  };

  const next = async (): Promise<void> => {
    if (getToken() === undefined) {
      const choice = await vscode.window.showInformationMessage(
        "Sign in first to fetch a wellness prompt.",
        "Sign in",
      );
      if (choice === "Sign in") {
        await signIn();
      }
      return;
    }
    const client = makeClient();
    try {
      const prompt = await client.next(timeZone());
      if (prompt === undefined) {
        void vscode.window.showInformationMessage(
          "No wellness prompt right now — no open gap in your schedule.",
        );
        return;
      }
      handlePrompt(client, prompt, { dedupe: false });
    } catch (error) {
      if (error instanceof WellnessAuthError) {
        onFatal("unauthorized");
        return;
      }
      void vscode.window.showErrorMessage(
        `Could not fetch a wellness prompt: ${describe(error)}`,
      );
    }
  };

  context.subscriptions.push(
    output,
    statusBar,
    vscode.commands.registerCommand("devngn.wellness.signIn", () => signIn()),
    vscode.commands.registerCommand("devngn.wellness.signOut", () => signOut()),
    vscode.commands.registerCommand("devngn.wellness.start", () => start()),
    vscode.commands.registerCommand("devngn.wellness.stop", () => stop()),
    vscode.commands.registerCommand("devngn.wellness.next", () => next()),
    {
      dispose: () => {
        if (stopStream !== null) {
          stopStream();
          stopStream = null;
        }
      },
    },
  );

  void loadSession();

  async function loadSession(): Promise<void> {
    try {
      const raw = await context.secrets.get(SECRET_KEY);
      if (raw !== undefined) {
        session = JSON.parse(raw) as StoredSession;
      }
    } catch {
      // Corrupt or unreadable secret — treat as signed out.
      session = null;
    }

    updateStatus(getToken() === undefined ? "signedOut" : "idle");

    if (config().get<boolean>("autoStart", false) && getToken() !== undefined) {
      await start();
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
