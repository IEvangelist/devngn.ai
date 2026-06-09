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
      description:
        "Human-first developer wellness — move more, tracked and shared.",
      customCss: ["./src/styles/retro.css"],
      components: {
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      sidebar: [
        {
          label: "Start here",
          items: [{ label: "Getting started", slug: "getting-started" }],
        },
        {
          label: "Wellness",
          items: [
            { label: "Wellness service", slug: "wellness" },
            { label: "API reference", link: "/wellness/reference" },
            { label: "OpenAPI document", link: "/wellness/openapi.json" },
          ],
        },
      ],
    }),
  ],
});
