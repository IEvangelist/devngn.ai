#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceEntry = path.join(packageRoot, "src", "index.ts");
const distEntry = path.join(packageRoot, "dist", "index.js");
const useSource =
  process.env.DEVNGN_CLI_USE_DIST !== "true" && existsSync(sourceEntry);

const childArgs = useSource
  ? [
      "--import",
      pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
      sourceEntry,
      ...process.argv.slice(2),
    ]
  : [distEntry, ...process.argv.slice(2)];

if (!useSource && !existsSync(distEntry)) {
  console.error(
    "devngn CLI is not built. Run `pnpm --filter @devngn/cli build` or use the workspace source checkout.",
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, childArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TSX_TSCONFIG_PATH:
      process.env.TSX_TSCONFIG_PATH ?? path.join(packageRoot, "tsconfig.json"),
  },
  stdio: "inherit",
});

if (result.error !== undefined) {
  console.error(result.error.message);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.signal !== null) {
  process.kill(process.pid, result.signal);
}

process.exit(1);
