// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Bridges native notification clicks into SPA navigation. When the user clicks
 * a wellness toast, the Rust side focuses the window and emits
 * `notification-activate` with the target route; here we listen for it and push
 * the router so the app lands on the relevant details (e.g. Today's "Right now").
 *
 * Best-effort and Tauri-only: the plain web/PWA build never emits this event.
 */
export default defineNuxtPlugin(() => {
  if (!useTauri()) return;

  const router = useRouter();
  let unlisten: (() => void) | undefined;

  import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen<string>("notification-activate", (event) => {
        const route =
          typeof event.payload === "string" && event.payload.length > 0
            ? event.payload
            : "/";
        void router.push(route);
      }),
    )
    .then((un) => {
      unlisten = un;
    })
    .catch(() => {
      // Activation routing is optional; ignore wiring failures.
    });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => unlisten?.());
  }
});
