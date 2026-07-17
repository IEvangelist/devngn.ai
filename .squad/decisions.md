# Squad Decisions

## Active Decisions

### 2026-07-17T10:05:14.880-05:00: User directive
**By:** IEvangelist (via Copilot)
**What:** Complete the selected strict-$0 migration from the unavailable Azure-hosted ASP.NET Core Wellness API to Node 24-compatible ESM TypeScript Netlify Functions with @netlify/database migrations, preserving every public /v1 contract and desktop/PWA behavior. Persist OAuth state, use polling behind WellnessClient.streamPrompts, enforce exact-origin CORS and production configuration validation, retain secrets only in runtime environment variables, keep changes surgical, test affected work, and do not commit or push.
**Why:** User request — captured for team memory

### 2026-07-17: Netlify monorepo config and runtime layout
**By:** Dozer
**What:** Netlify monorepo config: migrations at apps/site/netlify/database/migrations/, functions at apps/site/netlify/functions/, Node 24, esbuild
**References:** Morpheus, Trinity, Tank, apps/site/netlify.toml, .github/workflows/app-release.yml, .github/DEVOPS.md, apps/site/.env.example, apps/site/netlify/database/migrations/
**Why:**
- Migration directory is canonical at `apps/site/netlify/database/migrations/`.
- Functions directory is `apps/site/netlify/functions/`.
- Package directory is `apps/site`; base directory is repo root.
- Node 24 is configured in `apps/site/netlify.toml` and app release workflow.
- `app-release.yml` targets `https://devngn.ai` for the released API base URL.
- Exact-origin CORS allowlist: `https://devngn.ai`, `http://tauri.localhost`, `tauri://localhost`, `http://localhost:3000`, `http://localhost:7107`.

### 2026-07-17: Wellness API config contract
**By:** Dozer
**What:** Netlify wellness API config contract
**References:** IEvangelist, Morpheus, apps/site/netlify.toml, apps/site/.env.example, .github/DEVOPS.md
**Why:** Production Netlify paths are repo-root-relative because package directory is `apps/site`. `v1.ts` remains the default function mount, with `/v1` and `/v1/*` routed to it via the function's in-source path contract.

### 2026-07-17: Use in-source v1 path, not redirects
**By:** Dozer
**What:** Use in-source v1 path, not redirects
**References:** apps/site/netlify/functions/v1.ts, packages/wellness-functions/src/lib/config.ts, packages/wellness-functions/src/lib/cors.ts, apps/site/netlify.toml, apps/site/.env.example
**Why:** Keep `export const config: Config = { path: "/v1/*" }` authoritative; do not rewrite `/v1/*` back to `/.netlify/functions/v1` in `netlify.toml`.

### 2026-07-17: Replace SSE transport with polling in streamPrompts
**By:** Trinity
**What:** Replace SSE transport with polling in streamPrompts; point desktop/PWA to Netlify origin; update Tauri CSP
**References:** packages/wellness-client/src/client.ts, apps/app/nuxt.config.ts, apps/app/src-tauri/tauri.conf.json, packages/wellness-client/src/client.test.ts
**Why:** `WellnessClient.streamPrompts` polls `POST /v1/prompts/next`, desktop/PWA default to `https://devngn.ai`, and Tauri CSP must allow the Netlify origin while removing the old Azure API origin.

### 2026-07-17: Polling-only prompt delivery on Netlify
**By:** Morpheus
**What:** Use polling-only prompt delivery on Netlify
**References:** Netlify Wellness backend design review decision 2
**Why:** `GET /v1/prompts/stream` and `GET /v1/prompts/ws` return 501 ProblemDetails; `POST /v1/prompts/next` is the supported prompt contract.

### 2026-07-17: Wellness functions add Netlify dependencies
**By:** Morpheus
**What:** Wellness functions add Netlify dependencies
**References:** packages/wellness-functions/package.json, Dozer lock cleanup scope
**Why:** `@netlify/database`, `@netlify/functions`, and `@netlify/database-dev` are declared in the backend package; lock refresh remains with Dozer.

### 2026-07-17: Polling regression lockout and reassignment
**By:** Neo
**What:** Reject Trinity's `packages/wellness-client/src/client.ts` revision for unbounded abort listener accumulation in polling sleeps; lock Trinity out of this revision and reassign the client fix to Morpheus with regression coverage from Tank.
**References:** packages/wellness-client/src/client.ts, packages/wellness-client/src/client.test.ts
**Why:** The polling loop must not accumulate abort listeners across repeated sleeps; the corrected client implementation and tests now belong to Morpheus/Tank for this revision.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
