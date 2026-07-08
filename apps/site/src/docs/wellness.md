---
title: Wellness service
description: Opt-in developer wellness. Track goals and get ~5s movement-break prompts when a real gap opens in your schedule.
---

The devngn.ai **Wellness service** extends the dev engine from knowing about your _machine_ to (with explicit opt-in) knowing about the _person_ at the machine. It tracks a wellness profile, goals, and available equipment, watches for real gaps in your schedule, and nudges you with very short (~5 second) movement-break prompts the moment one appears.

It is open source under the MIT License, `Copyright (c) 2026-Present David Pine`.

<aside class="starlight-aside starlight-aside--note" aria-label="Everything is opt-in">
<p class="starlight-aside__title">Everything is opt-in</p>
<div class="starlight-aside__content">
No profile, goal, equipment, or schedule data is stored until you accept the current consent text. Calendar integrations read <strong>free/busy only</strong>; event titles and bodies are never persisted. You can delete everything you've shared at any time.
</div>
</aside>

## Architecture

- A hosted **ASP.NET Core minimal API** (`Devngn.Wellness.Api`) backed by PostgreSQL + EF Core, with data-protection encryption at rest for OAuth credentials.
- A versioned **OpenAPI document** emitted by the API: browse it in the [API reference](/wellness/reference) or download [`openapi.json`](/wellness/openapi.json).
- A typed **.NET client** (`Devngn.Wellness.Client`) over `IHttpClientFactory` + `IMemoryCache`.
- A types-only **TypeScript package** (`@devngn/wellness-types`) generated from the OpenAPI document, consumed by the VS Code extension and the CLI daemon.
- **Schedule adapters** for user-provided events, Google Calendar, and Microsoft Graph (read-only free/busy).
- **Delivery** through the VS Code extension and a `devngn wellness daemon` CLI subcommand.

## Authentication

Auth is GitHub OAuth. Headless surfaces (CLI, VS Code) use the **device flow** so there's no callback URL to host on your machine; the site uses the standard web flow. After the OAuth exchange the API issues a per-device **JWT bearer** token that you send as `Authorization: Bearer <token>` on every request.

- `POST /v1/auth/github/device`: start the device flow; returns a `userCode` and `verificationUri`.
- `POST /v1/auth/github/device/poll`: poll with the `sessionId` until the user authorizes (`200` token / `202` pending / `429` slow down).
- `GET /v1/auth/me`: the authenticated user.

## Consent, profile, goals & equipment

Accept consent first, then manage your data:

- `GET /v1/consent`, `POST /v1/consent`, `DELETE /v1/consent`: view, accept, or revoke. Revoking cascades to your stored wellness data.
- `GET/PUT/DELETE /v1/profile`: optional self-reported fields (fitness baseline, preferred intensity, time-of-day preferences, injuries/limitations as free-text + tags).
- `GET/POST/PUT/DELETE /v1/goals`: goals with a category (mobility, strength, breathing, posture, cardio-light), a target metric, and start/end dates.
- `GET/POST/PUT/DELETE /v1/equipment`: equipment you have on hand (`mat`, `bands-light`, `dumbbells-pair`, `standing-desk`, `chair-only`, …). Prompts are filtered to what you can actually use.

## Schedule sources

The API never stores what you're doing, only `{ start, end, busy/free, source }`.

- `GET/POST/GET/PATCH/DELETE /v1/schedule/sources`: register and manage sources (`user`, `google`, `microsoft`).
- `POST /v1/schedule/events`: bulk-push events for the user-provided source. `GET` and `DELETE /v1/schedule/events/{id}` manage them.
- `POST /v1/schedule/sources/{id}/sync`: refresh a Google/Microsoft source (pulls free/busy only).
- `GET /v1/schedule/connect/google` and `/microsoft` start the OAuth connect flows; `/v1/schedule/callback/...` complete them.

## Gaps & activities

- `GET /v1/gaps?from=&to=&tz=`: gaps computed on demand by a pure interval-reduction engine. Defaults: minimum gap 5 minutes, prompt cooldown 30 minutes, plus per-user blackout windows.
- `GET /v1/activities`: the catalog, filterable by equipment, body area, intensity, and duration. Each entry carries its animation reference and license attribution.

## Prompt delivery

When an eligible gap is open, the API matches an activity (equipment + profile + cooldown aware) and delivers a prompt:

- `GET /v1/prompts/stream`: **Server-Sent Events** stream (`event: prompt`), the primary delivery channel for the VS Code extension and CLI daemon.
- `GET /v1/prompts/ws`: a **WebSocket** equivalent.
- `GET /v1/prompts`: history; `POST /v1/prompts/next`: pull the next match on demand.
- `POST /v1/prompts/{id}/dismiss`, `/complete`, `/feedback`: record the outcome (feedback tunes future matches).

## VS Code extension

The VS Code extension subscribes to the prompt stream and surfaces movement breaks in-editor: a non-modal toast (Show me / Mark complete / Dismiss) and a read-only preview card showing the activity, its ~5s animation, body area, intensity, equipment, and license attribution. A status-bar control acts as a kill switch, and GitHub device-flow sign-in is stored in VS Code secret storage. Configure the API URL, autostart, and time zone in settings.

## CLI daemon

The CLI subscribes to the same stream and raises native OS notifications (Windows toast, macOS Notification Center, Linux libnotify) through an `INotifier` abstraction:

```sh
# Sign in once via the GitHub device flow (token stored in your OS state dir)
devngn wellness login

# Run the background daemon: notifies you when a movement break is due
devngn wellness daemon

# Useful flags
devngn wellness daemon --once          # deliver a single prompt, then exit
devngn wellness daemon --api-url <url>  # point at a non-default API
devngn wellness daemon --tz <IANA>      # override the detected time zone

# Sign out (removes the stored token)
devngn wellness logout
```

The daemon reconnects with capped backoff, dedupes repeated prompts, stops cleanly when its token is rejected (re-auth / consent required), and exits on `Ctrl+C` (a second interrupt forces exit).

## Privacy

- Calendar adapters persist free/busy only, never event titles or bodies.
- OAuth credentials are encrypted at rest with ASP.NET Core Data Protection.
- Revoking consent (`DELETE /v1/consent`) removes your stored wellness data.

## Try it

Browse the live [API reference](/wellness/reference), or feed [`openapi.json`](/wellness/openapi.json) into your own OpenAPI tooling (Scalar, Swagger UI, Redoc, Postman, …).
