# devngn.ai

**devngn.ai** is the dev engine for managing your AI-bits: the instructions, skills, rules, prompts, memories, model preferences, vendor folders, evals, and AI tooling configuration that accumulate across developer machines and workspaces.

The product is OS-agnostic and vendor-aware from the start. It ships as a CLI, a VS Code extension, and an Astro-powered marketing/docs/registry site that helps developers see, understand, and maintain the AI tooling they rely on.

## What devngn does

- Discovers AI-bits across the workspace and local developer environment.
- Grounds AI with a self-updating host profile that captures OS, CPU, GPU, memory, PATH tools, installed AI tools, findings, user preferences, and communication settings.
- Tracks AI provider readiness, SDK capability metadata, token budgeting, and provider bootstrap context for OpenAI, GitHub Copilot, Anthropic Claude, Google Gemini, and local OpenAI-compatible runtimes.
- Detects known AI ecosystem patterns such as `AGENTS.md`, GitHub Copilot instructions, Claude memory files, Cursor/Windsurf rules, MCP configs, promptfoo evals, Continue config, and Cline/Roo rules.
- Surfaces drift, duplicate guidance, tooling conflicts, stale AI-bits, and cleanup opportunities.
- Emits OpenTelemetry logs, traces, and metrics for important dev engine flows, with OTLP HTTP/protobuf export support for the Aspire dashboard.
- Provides VS Code experiences for AI-bit inventory, token usage, provider readiness, and recognized ecosystem patterns.
- Hosts versioned registries, docs, sync contracts, analytics schemas, and product surfaces from `devngn.ai`.

## Product surfaces

| Surface              | Purpose                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli`       | `devngn` CLI for scans, diagnostics, research prompts, provider readiness, token budgeting, grounding profiles, pattern recognition, sync, and update checks |
| `apps/vscode`        | VS Code extension with AI-bits tree views, a token usage dashboard, provider readiness, and pattern intelligence                                             |
| `apps/site`          | Astro + Starlight site for marketing, docs, and versioned public registry endpoints                                                                          |
| `apps/api`           | Hosted API contract validation for analytics, sync, AI requests, grounding manifests, and pattern databases                                                  |
| `apps/comms-apphost` | Aspire TypeScript AppHost for experimental notification backends such as MQTT/Zanzito SMS and playSMS-style gateways                                         |

## Workspace packages

| Package             | Purpose                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@devngn/core`      | Domain model, host/workspace scanning, AI-bit inventory, findings, recommendations, and privacy-aware summaries                 |
| `@devngn/vendors`   | Bundled vendor/tool registry and research freshness metadata                                                                    |
| `@devngn/research`  | Vendor `/research` SKILL prompts and research workflow schemas                                                                  |
| `@devngn/ai`        | Provider-aware runtime manifests, SDK/auth readiness, token estimation, token budgets, and bootstrap request creation           |
| `@devngn/grounding` | Self-updating devngn manifest/profile with host capabilities, hardware, PATH tools, user choices, and communication preferences |
| `@devngn/patterns`  | Versioned AI pattern database, trend metadata, workspace recognition, and experience-trigger aggregation                        |
| `@devngn/skills`    | Skill discovery, normalization, duplicate detection, and eval input helpers                                                     |
| `@devngn/evals`     | Pluggable eval runner contracts with an initial promptfoo-oriented shape                                                        |
| `@devngn/sync`      | Shared sync envelope, auth/session, and cloud/local persistence contracts                                                       |
| `@devngn/analytics` | OpenTelemetry setup, important flow catalog, normalized logs/traces/metrics, and redacted product analytics events              |

## Requirements

- Node.js 24 or newer
- pnpm 10.33.0
- Git
- Optional: Aspire CLI for `apps/comms-apphost`

## Getting started

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Run the CLI locally:

```sh
pnpm --filter @devngn/cli dev -- scan
pnpm --filter @devngn/cli dev -- doctor
pnpm --filter @devngn/cli dev -- patterns recognize
pnpm --filter @devngn/cli dev -- ai providers
pnpm --filter @devngn/cli dev -- ai budget --input "Summarize this workspace"
pnpm --filter @devngn/cli dev -- profile show
pnpm --filter @devngn/cli dev -- telemetry flows
pnpm --filter @devngn/cli dev -- telemetry config
```

Run the site locally:

```sh
pnpm dev:site
```

Run the experimental comms AppHost:

```sh
pnpm --filter @devngn/comms-apphost restore
pnpm dev:comms
```

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

## OpenTelemetry and Aspire

devngn analytics are OpenTelemetry-first. The shared analytics package defines the important product flows, emits normalized flow logs, spans, and metrics, and can export all three signals through OTLP HTTP/protobuf.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the Aspire dashboard OTLP endpoint to see devngn telemetry in the dashboard:

```sh
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
pnpm --filter @devngn/cli dev -- telemetry config
```

The experimental `apps/comms-apphost` also passes standard `OTEL_*` environment variables into its Dockerfile-backed resources so notification gateway logs, traces, and metrics can be correlated in Aspire.

## Storage and privacy defaults

devngn does not create a workspace `.devngn` folder by default. Private generated profile state is written to OS-native/XDG state locations, while shareable workspace policy should be explicit and reviewable through `package.json#devngn` or root-level `devngn.config.json`, `devngn.config.ts`, or `devngn.config.mjs`.

Analytics and sync payloads are intended to be first-party and privacy-conscious. Shared schemas should avoid raw instruction contents, secrets, prompts, completions, full environment dumps, and unnecessary hardware identifiers.

## Current status

This repository is private and currently represents the foundation of the product: monorepo scaffolding, CLI commands, shared schemas, the Astro site/docs, hosted registry endpoints, the VS Code extension shell and token dashboard, grounding profiles, communication preference models, and AI pattern intelligence.

## License

No license has been added yet.
