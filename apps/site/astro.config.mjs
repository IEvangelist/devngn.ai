import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";

export default defineConfig({
  site: "https://devngn.ai",
  output: "server",
  adapter: netlify(),
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
