import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node18",
  external: ["vscode"],
  noExternal: [
    "@devngn/ai",
    "@devngn/analytics",
    "@devngn/core",
    "@devngn/patterns",
    "@devngn/vendors",
    "@devngn/wellness-client",
  ],
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
