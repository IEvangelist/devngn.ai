---
title: Getting started
description: Start managing your AI-bits with devngn.ai.
---

devngn.ai is the dev engine for managing your AI-bits: the instructions, skills, rules, prompts, memories, model preferences, vendor folders, evals, and AI tooling configuration that collect across developer workspaces.

The first product milestone focuses on three surfaces:

- `devngn` CLI for scanning and syncing AI-bits.
- VS Code extension for visual inventory, drift, conflicts, and recommendations.
- Hosted Astro site for docs, account surfaces, registry delivery, and research freshness.

## CLI shape

```sh
devngn scan
devngn doctor
devngn profile show
devngn profile write
devngn profile comms
devngn patterns list
devngn patterns trends
devngn patterns recognize
devngn vendors
devngn research vendors
devngn ai providers
devngn ai budget --input "Summarize this workspace"
devngn ai bootstrap
devngn telemetry flows
devngn telemetry config
devngn skills list
devngn sync
```

## Vendor research

Every production adapter starts with a vendor `/research` SKILL run. The research output captures current folder structures, file patterns, metadata, extension IDs, commands, update channels, and branding references before devngn treats the adapter as reliable.

## Pattern intelligence

devngn maintains a versioned database of widely adopted AI patterns and trend metadata. These patterns describe common instruction files, rules, MCP configs, eval files, model preference surfaces, and workspace policy conventions. Run `devngn patterns recognize` to detect known patterns in the current workspace and see which experiences should light up, such as the MCP explorer, eval runner, grounding profile, token dashboard, conflict detection, or cleanup suggestions.

## AI runtime

devngn needs to consume the AI it helps manage. The shared runtime tracks provider SDKs, authentication signals, capabilities, token usage, and model context budgets for OpenAI, GitHub Copilot, Anthropic Claude, Google Gemini, and local OpenAI-compatible endpoints.

Provider invocation is adapter-gated: devngn should only call SDKs that are installed, authenticated, and capability-compatible. Requests are token-budgeted before dispatch, and provider-reported usage should replace estimates whenever an SDK exposes token accounting.

## OpenTelemetry analytics

devngn analytics are OpenTelemetry-first. The shared telemetry layer emits normalized logs, traces, and metrics for the most important dev engine flows: scans, doctor recommendations, grounding profile generation, pattern recognition, token budgeting, provider bootstrap, hosted sync preparation, VS Code token dashboard usage, communication notifications, and update checks.

Run `devngn telemetry flows` to inspect the measured flow catalog, or `devngn telemetry config` to see the local OTLP setup. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the Aspire dashboard OTLP endpoint to export logs, traces, and metrics through OTLP HTTP/protobuf. The experimental `apps/comms-apphost` passes standard `OTEL_*` variables to its resources so notification gateway telemetry can appear in the Aspire dashboard.

## Vendor intelligence API

devngn exposes a protected, subscriber-oriented REST API for richer vendor intelligence. The public `/registry/v1/vendors.json` endpoint remains lightweight, while `/api/vendors` and `/api/vendors/:id` are intended for API-key access to vendor standards, file locations, folder structures, company info, repositories, sites, common tools, CLIs, editor extensions, and research status.

Every vendor returned by `GET /api/vendors` is addressable through `GET /api/vendors/:id` by canonical ID and declared aliases. Current canonical IDs include `github-copilot`, `anthropic-claude-code`, `openai-codex`, `opencode`, `google-gemini`, `cursor`, `windsurf-codeium`, `continue`, `cline-roo`, `aider`, `amazon-q`, `jetbrains-ai`, `zed-ai`, `tabnine`, `git`, and `github-cli`.

Configure keys with `DEVNGN_VENDOR_API_KEYS` using comma-separated `key:plan:accountId` entries. Supported plans are `trial`, `pro`, `team`, and `enterprise`, each with separate rate limits. Requests must send `x-api-key` or `Authorization: Bearer <key>`.

```sh
$env:DEVNGN_VENDOR_API_KEYS = "local-dev-key:pro:local"
curl -H "x-api-key: local-dev-key" http://localhost:4321/api/vendors/openai
curl -H "x-api-key: local-dev-key" http://localhost:4321/api/vendors/opencode
curl -H "x-api-key: local-dev-key" http://localhost:4321/api/vendors/anthropic
```

The API is GET-only, rejects request bodies, caps URI length, rate limits failed authentication attempts by client, rate limits authorized calls by API key/subscription, and returns `RateLimit-*` plus `X-RateLimit-*` headers.

## Grounding profile

devngn grounds AI with a self-updating manifest/profile. The profile captures OS metadata, CPU, GPU, memory, PATH tools, known installed tools, AI-bits, findings, user choices, preferred name, username, email, and communication preferences. AI bootstrap requests can include this grounding summary so providers understand what the machine and workspace can actually use.

Run `devngn profile write` to create the private profile in the OS-native devngn state location. devngn does not create a workspace `.devngn` folder by default; use `--output` only when you intentionally want to export the manifest somewhere else.

Workspace policy should prefer existing/common project surfaces before introducing new folders: `package.json` can carry a `devngn` field, and explicit project config can use root-level `devngn.config.json`, `devngn.config.ts`, or `devngn.config.mjs`.

## Communication options

devngn can keep users posted about long-running AI loops, ralphs, research runs, and evals. The initial preference model supports local OS tray notifications, email, SMS, MQTT/Zanzito-style gateways, and playSMS-style gateways. Local notifications are enabled by default; email and SMS start disabled until the user configures a backend.

Experimental SMS/email gateway resources live in the Aspire TypeScript AppHost under `apps/comms-apphost`. Run `pnpm --filter @devngn/comms-apphost restore` before starting it so Aspire generates the TypeScript `.modules/` API surface.

## VS Code token dashboard

The VS Code extension includes a modern token usage dashboard. Run **devngn: Scan AI-bits** to populate a visual budget ring, input/output/reserve token metrics, provider SDK/auth readiness, and workspace signals. The dashboard is available from the devngn activity bar under **Token Usage** or through **devngn: Open Token Usage**.

## Hosted sync and analytics

The hosted surface is part of the product from the start. Sync payloads are redacted before they leave the machine, and analytics events use an allowlist schema that avoids raw instruction contents, secrets, prompts, completions, full environment dumps, and unnecessary hardware identifiers.
