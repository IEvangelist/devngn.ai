// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

use tauri::{Emitter, Manager};

/// Shows a native OS notification for a wellness nudge and, when the user
/// clicks it, focuses the app window and asks the frontend to route to `route`.
///
/// The Tauri notification plugin only delivers a click/activation callback on
/// mobile (desktop toasts are fire-and-forget), so on Windows we drive the
/// toast through `tauri-winrt-notification` directly to wire `on_activated`.
/// Other desktop platforms fall back to the plugin (no click routing there yet).
#[tauri::command]
fn show_wellness_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    route: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_winrt_notification::Toast;

        // Running from `tauri dev` (or any run straight out of target/*) the
        // app's AppUserModelID is not registered with Windows, so we borrow the
        // always-registered PowerShell AUMID to keep the toast (and its click
        // callback) working. Installed builds use the real identifier, which
        // the installer registers as a Start-menu shortcut, so Windows then
        // attributes the toast to "devngn" with the app icon.
        let app_id = if tauri::is_dev() {
            Toast::POWERSHELL_APP_ID.to_string()
        } else {
            app.config().identifier.clone()
        };

        let handle = app.clone();
        Toast::new(&app_id)
            .title(&title)
            .text1(&body)
            .on_activated(move |_action| {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = handle.emit("notification-activate", route.clone());
                Ok(())
            })
            .show()
            .map_err(|e| e.to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;

        // Click routing is Windows-only for now; still show the toast natively.
        let _ = &route;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Bring the main window to the front when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![show_wellness_notification])
        .setup(|app| {
            // Register the custom deep-link URI scheme for the OAuth callback.
            // The `devngn://` scheme is used by the GitHub web-flow to return
            // the access token to the desktop shell.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("devngn")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the devngn application");
}
