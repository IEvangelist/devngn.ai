// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

/**
 * Dependency-free TypeScript client for the devngn.ai Wellness API, shared by the
 * VS Code extension (`apps/vscode`), the CLI daemon (`packages/cli`), and the Nuxt
 * app (`apps/app`). It owns the polling-based prompt subscription (`POST
 * /v1/prompts/next`) plus the prompt-lifecycle and GitHub device-flow REST calls.
 * All typing flows from the generated `@devngn/wellness-types` package, which is
 * imported as types only so nothing here pulls a runtime dependency.
 */

export { SseDecoder, type SseEvent } from "./sse.js";
export {
  WellnessClient,
  WellnessAuthError,
  type WellnessClientConfig,
  type StreamHandlers,
  type StreamOptions,
  type StreamStatus,
  type StreamStopReason,
  type DevicePollResult,
} from "./client.js";
export { isSessionUsable, type StoredSession } from "./session.js";
