// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { defineNuxtConfig } from "nuxt/config";

// Tauri expects a fixed dev port and a static build it can bundle. When running
// inside `tauri dev`, TAURI_DEV_HOST may be set so the webview can reach the
// Vite dev server from the platform's WebView process.
const host = process.env.TAURI_DEV_HOST;

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",

  // SPA: one static bundle that Tauri loads directly and that also deploys as a
  // PWA. No server runtime is required for the desktop shell.
  ssr: false,

  devtools: { enabled: true },

  modules: [
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@nuxtjs/i18n",
    "@vite-pwa/nuxt",
  ],

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
        { name: "theme-color", content: "#ff5a1f" },
      ],
      link: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    },
  },

  runtimeConfig: {
    public: {
      // Overridable at runtime; the Aspire AppHost injects service discovery,
      // and the desktop build defaults to the hosted API.
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "https://localhost:7107",
      appChannel: process.env.NUXT_PUBLIC_APP_CHANNEL ?? "app",
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
      { code: "zh-Hans", language: "zh-Hans", file: "zh-Hans.json", name: "简体中文" },
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
      description:
        "Gamified, social wellness interruptions for developers.",
      theme_color: "#ff5a1f",
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
    server: {
      strictPort: true,
      hmr: host
        ? { protocol: "ws", host, port: 3001 }
        : undefined,
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
