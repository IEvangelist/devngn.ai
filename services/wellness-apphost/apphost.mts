// SPDX-License-Identifier: MIT
// Aspire AppHost for the devngn wellness service.
//
// Run `pnpm --filter @devngn/wellness-apphost restore` after a fresh checkout
// so Aspire regenerates `.aspire/modules/` for your machine, then
// `pnpm --filter @devngn/wellness-apphost start` to launch the dashboard,
// Postgres container, the Devngn.Wellness.Api project, and the apps/site
// frontend together. The apps/site frontend is wired with Aspire's native
// JavaScript hosting integration (`addViteApp`), which auto-installs its
// dependencies and runs the Astro dev server — no manual build prestep needed.

import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

const postgres = builder.addPostgres("postgres").withDataVolume();
const wellnessDb = postgres.addDatabase("wellnessdb");

// Profanity filter: all user-generated text (social display names, bios, and
// activity-feed posts) is sanitized through this service. ProfanityFilter.Hosting
// exposes a native `addProfanityFilter()` binding in the generated Aspire
// TypeScript SDK (verified in .aspire/modules/aspire.mts →
// 'ProfanityFilter.Hosting/addProfanityFilter'), so it's modeled as a first-class
// Aspire resource — no manual container plumbing needed. The API references it by
// its service-discovery name ("profanity-filter").
//
// UPSTREAM BUG (we're the first to run this in an Aspire TS apphost, as predicted):
// the ProfanityFilter.Hosting assembly hard-codes the container image tag
// `ghcr.io/ievangelist/profanity-filter-api:13.4.0`, and that tag was NEVER
// published to GHCR (published tags: 13.3.0, 13.4.6.1, 13.5.0, latest). The tag is
// a string literal baked into the DLL, decoupled from the NuGet package version —
// so BOTH package 13.4.0 and 13.5.0 request the missing `:13.4.0` image and the
// resource FailsToStart out of the box. The `addProfanityFilter` options only
// expose `devCertPassword`, so we override the tag on the returned container
// resource builder via `.withImageTag(...)`, pointing at a published image. This
// is prod-safe (no local `docker tag` hack required) and survives clean checkouts.
// Track the upstream fix in IEvangelist/profanity-filter (publish :13.4.0 or bump
// the hard-coded tag); remove this override once the package ships a valid tag.
const PROFANITY_IMAGE_TAG = "13.5.0";
const profanity = builder
  .addProfanityFilter("profanity-filter")
  .withImageTag(PROFANITY_IMAGE_TAG);

// Local-dev placeholder configuration so the API host passes its strict
// options validation and boots on a fresh checkout. Real OAuth/JWT secrets
// belong in dotnet user-secrets (or the deployment environment); these
// placeholders are enough to bring the service up and exercise endpoints
// that don't actually round-trip with the upstream identity provider.
const wellnessMigrator = builder
  .addProject(
    "wellness-migrator",
    "../Devngn.Wellness.MigrationWorker/Devngn.Wellness.MigrationWorker.csproj",
  )
  .withReference(wellnessDb)
  .waitFor(wellnessDb);

const wellnessApi = builder
  .addProject(
    "wellness-api",
    "../Devngn.Wellness.Api/Devngn.Wellness.Api.csproj",
    { launchProfileOrOptions: "https" },
  )
  .withReference(wellnessDb)
  .withReference(profanity)
  .waitFor(profanity)
  .waitForCompletion(wellnessMigrator);

// Surface Scalar (and the raw OpenAPI document) as one-click links on the
// wellness-api resource panel in the Aspire dashboard. `withUrl` ADDS new
// URL annotations alongside the endpoint URLs (vs. `withUrlForEndpoint`
// which would replace them). The absolute URLs match launchSettings.json's
// `https` profile (Aspire's DCP proxies through these declared ports).
await wellnessApi.withUrl("https://localhost:7107/scalar/v1", { displayText: "Scalar API reference" });
await wellnessApi.withUrl("https://localhost:7107/openapi/v1.json", { displayText: "OpenAPI document" });

const devEnv: Record<string, string> = {
  // GitHub OAuth (web flow) — placeholders; real flow needs registered app.
  "Auth__GitHub__ClientId": "dev-github-client-id",
  "Auth__GitHub__ClientSecret": "dev-github-client-secret",

  // JWT signing — base64-encoded 66-byte dev key (>= 32 bytes after decode
  // for HMAC-SHA256). Decoded plaintext is
  // "devngn-wellness-jwt-signing-key-dev-only-do-not-use-in-production!".
  "Auth__Jwt__Issuer": "https://localhost:7107",
  "Auth__Jwt__Audience": "devngn-wellness-dev",
  "Auth__Jwt__SigningKey":
    "ZGV2bmduLXdlbGxuZXNzLWp3dC1zaWduaW5nLWtleS1kZXYtb25seS1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24h",

  // Google Calendar OAuth — placeholders; real flow needs Google Cloud creds.
  "Auth__Google__ClientId": "dev-google-client-id",
  "Auth__Google__ClientSecret": "dev-google-client-secret",
  "Auth__Google__RedirectUri": "https://localhost:7107/v1/schedule/google/callback",

  // Microsoft Graph OAuth — placeholders; real flow needs Entra app reg.
  "Auth__Microsoft__ClientId": "dev-microsoft-client-id",
  "Auth__Microsoft__ClientSecret": "dev-microsoft-client-secret",
  "Auth__Microsoft__RedirectUri":
    "https://localhost:7107/v1/schedule/microsoft/callback",
};

for (const [key, value] of Object.entries(devEnv)) {
  await wellnessApi.withEnvironment(key, value);
}

// Frontend: the Astro (Starlight) web app at apps/site that hosts the wellness
// docs and the server-rendered OpenAPI reference (/wellness/, /wellness/reference).
// Astro is Vite-based, so it's modeled with the native JavaScript hosting
// integration (Aspire.Hosting.JavaScript) via `addViteApp`. Aspire auto-installs
// dependencies with pnpm and runs the `dev` script (`astro dev`) — assigning the
// port, proxying, and visualizing it in the dashboard alongside the API — so no
// manual `pnpm --filter @devngn/site build` prestep is needed on a fresh checkout.
// withReference wires API service discovery for when the site calls the live API;
// waitFor holds startup until the API is ready.
const wellnessSite = builder
  .addViteApp("wellness-site", "../../apps/site", { runScriptName: "dev" })
  .withPnpm()
  .withReference(wellnessApi)
  .waitFor(wellnessApi);

await wellnessSite.withExternalHttpEndpoints();

await builder.build().run();
