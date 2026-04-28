import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://devngn.ai",
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
