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
devngn vendors
devngn research vendors
devngn ai providers
devngn ai budget --input "Summarize this workspace"
devngn ai bootstrap
devngn skills list
devngn sync
```

## Vendor research

Every production adapter starts with a vendor `/research` SKILL run. The research output captures current folder structures, file patterns, metadata, extension IDs, commands, update channels, and branding references before devngn treats the adapter as reliable.

## AI runtime

devngn needs to consume the AI it helps manage. The shared runtime tracks provider SDKs, authentication signals, capabilities, token usage, and model context budgets for OpenAI, GitHub Copilot, Anthropic Claude, Google Gemini, and local OpenAI-compatible endpoints.

Provider invocation is adapter-gated: devngn should only call SDKs that are installed, authenticated, and capability-compatible. Requests are token-budgeted before dispatch, and provider-reported usage should replace estimates whenever an SDK exposes token accounting.

## Grounding profile

devngn grounds AI with a self-updating manifest/profile. The profile captures OS metadata, CPU, GPU, memory, PATH tools, known installed tools, AI-bits, findings, user choices, preferred name, username, email, and communication preferences. AI bootstrap requests can include this grounding summary so providers understand what the machine and workspace can actually use.

Run `devngn profile write` to create `.devngn/profile.json` for the current workspace.

## Communication options

devngn can keep users posted about long-running AI loops, ralphs, research runs, and evals. The initial preference model supports local OS tray notifications, email, SMS, MQTT/Zanzito-style gateways, and playSMS-style gateways. Local notifications are enabled by default; email and SMS start disabled until the user configures a backend.

Experimental SMS/email gateway resources live in the Aspire TypeScript AppHost under `apps/comms-apphost`. Run `pnpm --filter @devngn/comms-apphost restore` before starting it so Aspire generates the TypeScript `.modules/` API surface.

## VS Code token dashboard

The VS Code extension includes a modern token usage dashboard. Run **devngn: Scan AI-bits** to populate a visual budget ring, input/output/reserve token metrics, provider SDK/auth readiness, and workspace signals. The dashboard is available from the devngn activity bar under **Token Usage** or through **devngn: Open Token Usage**.

## Hosted sync and analytics

The hosted surface is part of the product from the start. Sync payloads are redacted before they leave the machine, and analytics events use an allowlist schema that avoids raw instruction contents, secrets, prompts, completions, full environment dumps, and unnecessary hardware identifiers.
