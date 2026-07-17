// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { defineNuxtConfig } from "nuxt/config";
import { readFileSync } from "node:fs";

// Tauri expects a fixed dev port and a static build it can bundle. When running
// inside `tauri dev`, TAURI_DEV_HOST may be set so the webview can reach the
// Vite dev server from the platform's WebView process.
const host = process.env.TAURI_DEV_HOST;

// Single source of truth for the app version is the Tauri config; the desktop
// binary reports the same value via `getVersion()`. Bake it into the SPA so the
// PWA/web build (which has no Tauri API) can display it too. Overridable via env.
const appVersion =
  process.env.NUXT_PUBLIC_APP_VERSION ??
  (JSON.parse(
    readFileSync(
      new URL("./src-tauri/tauri.conf.json", import.meta.url),
      "utf-8",
    ),
  ).version as string);

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",

  // SPA: one static bundle that Tauri loads directly and that also deploys as a
  // PWA. No server runtime is required for the desktop shell.
  ssr: false,

  devtools: { enabled: true },

  modules: ["@pinia/nuxt", "@vueuse/nuxt", "@nuxtjs/i18n", "@vite-pwa/nuxt"],

  // Register components WITHOUT the subdirectory path-prefix so that
  // <BrutButton> resolves instead of <UiBrutButton>.
  // All templates already use the short names; this aligns the runtime
  // registry with what resolveComponent() looks up.
  components: {
    dirs: [{ path: "~/components", pathPrefix: false }],
  },

  css: ["~/assets/css/retro.css"],

  app: {
    head: {
      title: "devngn",
      htmlAttrs: { lang: "en" },
      meta: [
        { charset: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        {
          name: "description",
          content:
            "devngn — gamified, social wellness interruptions for developers.",
        },
        { name: "theme-color", content: "#ec1c8b" },
      ],
      link: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    },
  },

  runtimeConfig: {
    public: {
      // Installed builds use the Netlify API by default. Local API development
      // can opt in with NUXT_PUBLIC_API_BASE_URL.
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "https://devngn.ai",
      appChannel: process.env.NUXT_PUBLIC_APP_CHANNEL ?? "app",
      // Displayed in Settings → About. In the desktop build the installed
      // binary's version (getVersion()) takes precedence at runtime.
      appVersion,
    },
  },

  i18n: {
    defaultLocale: "en",
    strategy: "no_prefix",
    // Source catalog authored here; IEvangelist/resource-translator opens PRs
    // that add the sibling locale files under i18n/locales.
    locales: [
      { code: "en", language: "en-US", file: "en.json", name: "English" },
      { code: "es", language: "es-ES", file: "es.json", name: "Español" },
      { code: "fr", language: "fr-FR", file: "fr.json", name: "Français" },
      { code: "de", language: "de-DE", file: "de.json", name: "Deutsch" },
      { code: "pt", language: "pt-BR", file: "pt.json", name: "Português" },
      { code: "ja", language: "ja-JP", file: "ja.json", name: "日本語" },
      {
        code: "zh-Hans",
        language: "zh-Hans",
        file: "zh-Hans.json",
        name: "简体中文",
      },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "devngn_locale",
      redirectOn: "root",
    },
  },

  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "devngn",
      short_name: "devngn",
      description: "Gamified, social wellness interruptions for developers.",
      theme_color: "#ec1c8b",
      background_color: "#fdf3df",
      display: "standalone",
      start_url: "/",
      icons: [
        { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
        { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/pwa-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      navigateFallback: "/",
      globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
    },
    client: { installPrompt: true },
    devOptions: { enabled: false, suppressWarnings: true },
  },

  vite: {
    // Tauri needs a stable dev server; don't fall back to a random port.
    clearScreen: false,
    // Pre-bundle the Tauri API/plugin entrypoints (and reka-ui) so Vite never
    // discovers them at runtime. Runtime discovery forces a full dep re-optimize
    // and page reload, which races the Tauri webview during `tauri dev` and can
    // crash it (devngn.exe exits). Listing them here keeps the dev session stable.
    optimizeDeps: {
      include: [
        "@tauri-apps/api/core",
        "@tauri-apps/api/event",
        "@tauri-apps/api/app",
        "@tauri-apps/plugin-store",
        "@tauri-apps/plugin-opener",
        "@tauri-apps/plugin-notification",
        "@tauri-apps/plugin-os",
        "@tauri-apps/plugin-process",
        "@tauri-apps/plugin-updater",
        "reka-ui",
      ],
    },
    server: {
      strictPort: true,
      hmr: host ? { protocol: "ws", host, port: 3001 } : undefined,
      watch: {
        // Rust rebuilds are driven by Tauri, not Vite.
        ignored: ["**/src-tauri/**"],
      },
    },
  },

  devServer: {
    port: 3000,
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
});
