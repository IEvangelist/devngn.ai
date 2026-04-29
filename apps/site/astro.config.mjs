import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://devngn.ai",
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [
    starlight({
      title: "devngn.ai",
      description: "The dev engine for managing your AI-bits.",
      sidebar: [
        {
          label: "Start here",
          items: [{ label: "Getting started", slug: "getting-started" }],
        },
      ],
    }),
  ],
});
