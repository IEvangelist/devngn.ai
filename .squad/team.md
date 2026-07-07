# Squad Team

> ievangelist-stunning-fortnight

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| 🏗️ Neo | Lead | Scope, architecture decisions, code review, reviewer gate | active |
| ⚛️ Trinity | Frontend Dev | Nuxt 4 / Vue / Tauri v2 / PWA / neo-brutalist UI, gamification & social UI, i18n wiring | active |
| 🔧 Morpheus | Backend Dev | .NET 10 / Aspire / EF Core APIs, gamification & social domain, profanity filter container | active |
| 🛠️ Dozer | DevOps / Release | CI, Tauri packaging + signed auto-update, resource-translator workflow | active |
| 🧪 Tank | Tester | Vitest, xUnit, Playwright e2e, axe a11y, coverage & edge cases | active |
| 📋 Scribe | (silent) | Memory, decisions, session logs | active |
| 🔄 Ralph | (monitor) | Work queue, backlog, keep-alive | active |
| 🛡️ Rai | (background) | RAI awareness, content safety | active |

## Project Context

- **Project:** devngn — cross-platform wellness "interruption" companion (Tauri v2 desktop + installable PWA) with gamification, social, GitHub auth, localization, and dead-simple auto-updates.
- **Universe:** The Matrix
- **Requested by:** David Pine (dapine)
- **Created:** 2026-07-06
- **Frontend:** `apps/app` (Nuxt 4 SPA + Tauri v2), neo-brutalist design system in `apps/app/app/assets/css/retro.css`.
- **Backend:** `services/` (.NET 10 Aspire wellness stack), TS AppHost `services/wellness-apphost/apphost.mts`.
- **Reused assets:** `@devngn/wellness-client` (SSE + GitHub device flow), `@devngn/wellness-types` (OpenAPI-generated).
- **Constraints:** .NET `TreatWarningsAsErrors=true`, nullable enabled → must build clean. One converging change on branch `dapine/devngn-desktop-app`. Coordinator (not agents) owns all git operations. Never use the `SkynetBot-001` account.
