// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Nuxt configuration used only by the Vitest test environment.
 * Excludes @vite-pwa/nuxt because it registers virtual Vite modules
 * ("virtual:pwa-register/vue") that cannot be resolved in the Node.js
 * test runner — the file:// URL produced by the plugin is not a valid
 * filesystem path. All other modules are kept so auto-imports work.
 */
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  modules: [
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@nuxtjs/i18n",
    // '@vite-pwa/nuxt' excluded — virtual module resolution fails in Node
  ],
  css: ["~/assets/css/retro.css"],
  runtimeConfig: {
    public: {
      apiBaseUrl: "https://devngn.ai",
      appChannel: "app",
      appVersion: "0.0.1-alpha.420",
    },
  },
  i18n: {
    defaultLocale: "en",
    strategy: "no_prefix",
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
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
});
