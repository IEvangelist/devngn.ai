// SPDX-License-Identifier: MIT
// Aspire AppHost for the devngn wellness service.
//
// Run `pnpm --filter @devngn/wellness-apphost restore` after a fresh checkout
// so Aspire regenerates `.aspire/modules/` for your machine, then
// `pnpm --filter @devngn/wellness-apphost start` to launch the dashboard,
// Postgres container, and the Devngn.Wellness.Api project together.

import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

const postgres = builder.addPostgres("postgres").withDataVolume();
const wellnessDb = postgres.addDatabase("wellnessdb");

// Local-dev placeholder configuration so the API host passes its strict
// options validation and boots on a fresh checkout. Real OAuth/JWT secrets
// belong in dotnet user-secrets (or the deployment environment); these
// placeholders are enough to bring the service up and exercise endpoints
// that don't actually round-trip with the upstream identity provider.
const wellnessApi = builder
  .addProject(
    "wellness-api",
    "../Devngn.Wellness.Api/Devngn.Wellness.Api.csproj",
    { launchProfileOrOptions: "https" },
  )
  .withReference(wellnessDb)
  .waitFor(wellnessDb);

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

await builder.build().run();
