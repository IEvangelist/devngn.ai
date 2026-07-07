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

// Run mode = local `aspire start`; publish mode = `aspire publish` / `aspire deploy`.
// Used below to keep local dev unchanged while shaping the Azure deployment.
const isRunMode = await builder.executionContext().isRunMode();

// Azure Container Apps is the deployment target for `aspire deploy`. Adding the
// environment resource is inert during local run mode.
builder.addAzureContainerAppEnvironment("aca");

// PostgreSQL: Azure Database for PostgreSQL Flexible Server in production, and a
// local container (with a persistent data volume) during `aspire start`. A plain
// container with a data volume CANNOT run on Azure Container Apps: ACA's only
// persistent volume type is Azure Files (SMB), and Postgres `initdb` fails to
// chmod its data directory there ("Operation not permitted"). Flexible Server is
// a managed, durable database with no such limitation. Password authentication
// keeps the connection string standard (user/password), so the API and migrator
// need no code changes vs. the local container.
const postgres = builder
  .addAzurePostgresFlexibleServer("postgres")
  .runAsContainer({
    configureContainer: async (container) => {
      await container.withDataVolume();
    },
  })
  .withPasswordAuthentication();
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
//
// DEPLOYMENT NOTE: ProfanityFilterResource exposes ONLY an HTTPS (dev-cert)
// endpoint and its connection string is hard-coded to https. Azure Container Apps
// terminates TLS at its ingress and can't model a container-level https endpoint,
// so this resource is included in local run mode only. In production the API's
// profanity HttpClient (`https+http://profanity-filter`) is simply unresolved and
// the social display-name/bio sanitization degrades gracefully (503) — auth and
// startup are unaffected. Host a TLS-terminated profanity filter later to restore it.
const PROFANITY_IMAGE_TAG = "13.5.0";
const profanity = isRunMode
  ? builder.addProfanityFilter("profanity-filter").withImageTag(PROFANITY_IMAGE_TAG)
  : undefined;

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
    // Local dev uses the `https` profile (https://localhost:7107). In publish
    // mode, use the `http` profile so the container exposes a single HTTP
    // endpoint; Azure Container Apps terminates TLS at its ingress (port 443).
    // Keeping an `https` container endpoint breaks ACA env-var resolution.
    { launchProfileOrOptions: isRunMode ? "https" : "http" },
  )
  .withReference(wellnessDb)
  .waitForCompletion(wellnessMigrator);

// Wire the profanity filter only when it's part of the model (local run mode).
if (profanity) {
  await wellnessApi.withReference(profanity);
  await wellnessApi.waitFor(profanity);
}

// Public ingress: the desktop app and PWA reach this API directly for GitHub
// sign-in (device + web OAuth flows), so it needs an external HTTP endpoint
// when deployed to Azure Container Apps.
await wellnessApi.withExternalHttpEndpoints();

// Surface Scalar (and the raw OpenAPI document) as one-click links on the
// wellness-api resource panel in the Aspire dashboard (local dev only). `withUrl`
// ADDS URL annotations alongside the endpoint URLs. The absolute URLs match
// launchSettings.json's `https` profile (Aspire's DCP proxies these ports).
if (isRunMode) {
  await wellnessApi.withUrl("https://localhost:7107/scalar/v1", { displayText: "Scalar API reference" });
  await wellnessApi.withUrl("https://localhost:7107/openapi/v1.json", { displayText: "OpenAPI document" });
}

// Auth configuration. Local dev uses safe placeholders so the API boots on a
// fresh checkout with `aspire start`. Deploys inject real secrets via Aspire
// secret parameters, supplied as `Parameters__<name>` env vars on
// `aspire deploy` and stored in Azure Key Vault (never committed).
if (isRunMode) {
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
} else {
  // Real GitHub sign-in secrets, provided at deploy time via:
  //   Parameters__github_client_id, Parameters__github_client_secret, Parameters__jwt_signing_key
  const githubClientId = builder.addParameter("github-client-id", { secret: true });
  const githubClientSecret = builder.addParameter("github-client-secret", { secret: true });
  const jwtSigningKey = builder.addParameter("jwt-signing-key", { secret: true });

  await wellnessApi.withEnvironment("Auth__GitHub__ClientId", githubClientId);
  await wellnessApi.withEnvironment("Auth__GitHub__ClientSecret", githubClientSecret);

  await wellnessApi.withEnvironment("Auth__Jwt__Issuer", "https://api.devngn.ai");
  await wellnessApi.withEnvironment("Auth__Jwt__Audience", "devngn-wellness");
  await wellnessApi.withEnvironment("Auth__Jwt__SigningKey", jwtSigningKey);

  // Calendar integrations are not part of GitHub sign-in. Non-empty placeholders
  // keep the API's strict options validation happy so it boots; wire real creds later.
  await wellnessApi.withEnvironment("Auth__Google__ClientId", "unconfigured");
  await wellnessApi.withEnvironment("Auth__Google__ClientSecret", "unconfigured");
  await wellnessApi.withEnvironment("Auth__Google__RedirectUri", "https://api.devngn.ai/v1/schedule/google/callback");
  await wellnessApi.withEnvironment("Auth__Microsoft__ClientId", "unconfigured");
  await wellnessApi.withEnvironment("Auth__Microsoft__ClientSecret", "unconfigured");
  await wellnessApi.withEnvironment("Auth__Microsoft__RedirectUri", "https://api.devngn.ai/v1/schedule/microsoft/callback");
}

// Frontend (LOCAL DEV ONLY): the Astro (Starlight) web app at apps/site that
// hosts the wellness docs and the server-rendered OpenAPI reference
// (/wellness/, /wellness/reference). Astro is Vite-based, so it's modeled with
// the native JavaScript hosting integration (Aspire.Hosting.JavaScript) via
// `addViteApp`, running the `dev` script (`astro dev`) in the dashboard next to
// the API. In production the site is deployed to Netlify, so it is intentionally
// excluded from the Azure Container Apps deployment (publish mode).
if (isRunMode) {
  const wellnessSite = builder
    .addViteApp("wellness-site", "../../apps/site", { runScriptName: "dev" })
    .withPnpm()
    .withReference(wellnessApi)
    .waitFor(wellnessApi);

  await wellnessSite.withExternalHttpEndpoints();
}

await builder.build().run();
