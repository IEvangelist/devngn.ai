// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import * as vscode from "vscode";
import type { PromptResponse } from "@devngn/wellness-types";

/** Lifecycle callbacks invoked from the prompt toast's action buttons. */
export interface PromptActions {
  complete(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  preview(prompt: PromptResponse): void;
}

/**
 * Shows a non-modal toast for a delivered prompt with Show / Complete / Dismiss
 * actions, dispatching the chosen action. Returns once the user responds (or the
 * toast is dismissed).
 */
export async function presentPrompt(
  prompt: PromptResponse,
  actions: PromptActions,
): Promise<void> {
  const seconds = toSeconds(prompt.durationSeconds);
  const choice = await vscode.window.showInformationMessage(
    `🧘 Time to move — ${prompt.activityTitle} · ${seconds}s · ${prompt.bodyArea}`,
    "Show me",
    "Mark complete",
    "Dismiss",
  );

  switch (choice) {
    case "Show me":
      actions.preview(prompt);
      break;
    case "Mark complete":
      await actions.complete(prompt.id);
      break;
    case "Dismiss":
      await actions.dismiss(prompt.id);
      break;
    default:
      break;
  }
}

/**
 * Opens a read-only webview panel previewing the activity: title, description,
 * the ~5s animation reference, and metadata (body area, intensity, equipment,
 * license attribution). Scripts are disabled, matching the extension's other
 * webviews, so the lifecycle actions live on the toast rather than in-panel.
 */
export function openPromptPreview(prompt: PromptResponse): void {
  const panel = vscode.window.createWebviewPanel(
    "devngnWellnessPrompt",
    `Wellness · ${prompt.activityTitle}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );
  panel.webview.html = renderPromptHtml(prompt);
}

function renderPromptHtml(prompt: PromptResponse): string {
  const seconds = toSeconds(prompt.durationSeconds);
  const equipment =
    prompt.equipmentTags.length === 0
      ? "No equipment needed"
      : prompt.equipmentTags.map(escapeHtml).join(" · ");
  const attribution =
    prompt.licenseAttribution === null ||
    prompt.licenseAttribution === undefined
      ? ""
      : `<p class="attribution">${escapeHtml(prompt.licenseAttribution)}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        --accent: #70f0c8;
        --muted: var(--vscode-descriptionForeground, #94a3b8);
      }
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        padding: 1.5rem;
        line-height: 1.5;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.7rem;
        color: var(--muted);
      }
      h1 {
        margin: 0.25rem 0 0.75rem;
        font-size: 1.6rem;
      }
      .timer {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: rgba(112, 240, 200, 0.14);
        color: var(--accent);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-weight: 600;
        font-size: 0.85rem;
      }
      .animation {
        margin: 1.25rem 0;
        border: 1px dashed var(--vscode-panel-border, rgba(148, 163, 184, 0.4));
        border-radius: 1rem;
        padding: 2rem 1rem;
        text-align: center;
        color: var(--muted);
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .meta div {
        background: var(--vscode-editorWidget-background, rgba(148, 163, 184, 0.08));
        border-radius: 0.6rem;
        padding: 0.6rem 0.8rem;
      }
      .meta span {
        display: block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .meta strong {
        font-size: 0.95rem;
      }
      .attribution {
        margin-top: 1.25rem;
        font-size: 0.75rem;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <div class="eyebrow">wellness break</div>
    <h1>${escapeHtml(prompt.activityTitle)}</h1>
    <div class="timer">⏱ ${seconds}s</div>
    <p>${escapeHtml(prompt.activityDescription)}</p>
    <div class="animation">
      <div style="font-size:2.5rem">🤸</div>
      <p>Animation: <strong>${escapeHtml(prompt.animationProvider)}</strong> ·
        <code>${escapeHtml(prompt.animationAssetId)}</code></p>
    </div>
    <div class="meta">
      <div><span>Body area</span><strong>${escapeHtml(prompt.bodyArea)}</strong></div>
      <div><span>Intensity</span><strong>${escapeHtml(prompt.intensity)}</strong></div>
      <div><span>Duration</span><strong>${seconds}s</strong></div>
      <div><span>Equipment</span><strong>${equipment}</strong></div>
    </div>
    ${attribution}
  </body>
</html>`;
}

function toSeconds(value: number | string): number {
  const seconds =
    typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds : 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
