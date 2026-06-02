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

builder
  .addProject(
    "wellness-api",
    "../Devngn.Wellness.Api/Devngn.Wellness.Api.csproj",
    { launchProfileOrOptions: "https" },
  )
  .withReference(wellnessDb)
  .waitFor(wellnessDb);

await builder.build().run();
