// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import * as vscode from "vscode";
import type { StoredSession, WellnessClient } from "@devngn/wellness-client";

/**
 * Drives the GitHub device-authorization flow with VS Code UI: starts a session,
 * copies the user code and opens GitHub, then polls (honoring the server's
 * interval / `slow_down` / `Retry-After`) inside a cancellable progress
 * notification until a token is issued. Returns the session to persist, or `null`
 * if the user cancels, the flow errors, or it times out.
 */
export async function runDeviceFlowSignIn(
  client: WellnessClient,
): Promise<StoredSession | null> {
  let start;
  try {
    start = await client.startDeviceFlow();
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Wellness sign-in could not start: ${describe(error)}`,
    );
    return null;
  }

  await vscode.env.clipboard.writeText(start.userCode);
  const action = await vscode.window.showInformationMessage(
    `Wellness sign-in: your device code ${start.userCode} was copied. Open GitHub and paste it to authorize.`,
    "Open GitHub",
    "Cancel",
  );
  if (action !== "Open GitHub") {
    return null;
  }
  await vscode.env.openExternal(vscode.Uri.parse(start.verificationUri));

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Waiting for GitHub authorization…",
      cancellable: true,
    },
    async (_progress, token): Promise<StoredSession | null> => {
      let intervalMs = Math.max(1, toNumber(start.intervalSeconds, 5)) * 1000;
      const deadline =
        Date.now() + Math.max(60, toNumber(start.expiresInSeconds, 300)) * 1000;

      while (Date.now() < deadline) {
        if (token.isCancellationRequested) {
          return null;
        }
        await delay(intervalMs, token);
        if (token.isCancellationRequested) {
          return null;
        }

        let result;
        try {
          result = await client.pollDeviceFlow(start.sessionId);
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Wellness sign-in failed: ${describe(error)}`,
          );
          return null;
        }

        switch (result.kind) {
          case "success":
            return {
              accessToken: result.token.accessToken,
              tokenType: result.token.tokenType,
              expiresAt: String(result.token.expiresAt),
              login: result.token.user?.login,
            };
          case "pending":
            if (result.retryAfterSeconds !== undefined) {
              intervalMs = result.retryAfterSeconds * 1000;
            }
            break;
          case "slowDown":
            intervalMs =
              (result.retryAfterSeconds ?? intervalMs / 1000 + 5) * 1000;
            break;
          case "error":
            void vscode.window.showErrorMessage(
              `Wellness sign-in failed: ${result.error}${
                result.description ? ` (${result.description})` : ""
              }`,
            );
            return null;
        }
      }

      void vscode.window.showErrorMessage(
        "Wellness sign-in timed out. Please try again.",
      );
      return null;
    },
  );
}

function delay(ms: number, token: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    token.onCancellationRequested(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toNumber(value: number | string, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
