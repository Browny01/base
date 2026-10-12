mod database;
mod imports;
mod lifecycle;
mod note_lock;
mod performance;
mod transport;
mod updates;
mod workspace_service;
fn main() {
    base_run();
}
fn base_run() {
    tauri::Builder::default()
        .manage(performance::Startup::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
            }
            app.manage(database::Database::open(&directory.join("base.sqlite3"))?);
            app.manage(transport::Transport::new());
            app.manage(transport::CloudLogin::default());
            app.manage(lifecycle::Shutdown::default());
            app.manage(updates::Updates(std::sync::Mutex::new(None)));
            use tauri::{
                menu::{Menu, MenuItem, Submenu},
                Emitter,
            };
            let menu = Menu::default(app.handle())?;
            let workspace_menu = Submenu::with_items(
                app,
                "Workspace",
                true,
                &[
                    &MenuItem::with_id(
                        app,
                        "command",
                        "Command Palette",
                        true,
                        Some("CmdOrCtrl+K"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "new-task",
                        "New Task",
                        true,
                        Some("CmdOrCtrl+Shift+N"),
                    )?,
                    &MenuItem::with_id(app, "/settings", "Settings", true, Some("CmdOrCtrl+,"))?,
                ],
            )?;
            menu.append(&workspace_menu)?;
            #[cfg(target_os = "linux")]
            workspace_menu.append(&MenuItem::with_id(
                app,
                "quit",
                "Quit Base",
                true,
                Some("Ctrl+Q"),
            )?)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "quit" {
                    let _ = app.emit("base:exit-requested", ());
                } else {
                    let _ = app.emit("base:menu", event.id().as_ref());
                }
            });
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            if let Err(error) =
                app.global_shortcut()
                    .on_shortcut("Control+Alt+Space", |app, _, event| {
                        if event.state == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    })
            {
                eprintln!("Global shortcut unavailable on this desktop: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::load_workspace,
            database::commit_local,
            database::apply_sync,
            database::resolve_conflict,
            transport::connect_account,
            transport::cloud_sign_in_start,
            transport::cloud_sign_in_finish,
            transport::disconnect_account,
            transport::api_request,
            transport::integration_status,
            transport::set_integration_key,
            transport::download_workspace_file,
            transport::open_external,
            transport::export_workspace,
            updates::check_update,
            updates::install_update,
            transport::print_document,
            transport::cache_media,
            lifecycle::shutdown_ready,
            lifecycle::finish_exit,
            lifecycle::close_window,
            imports::import_workspace,
            imports::list_offline_workspaces,
            imports::activate_offline_workspace,
            imports::read_offline_source,
            note_lock::verify_note_password,
            note_lock::set_local_note_password,
            performance::record_frontend_ready,
            performance::record_scroll_sample,
            workspace_service::workspace_service_start,
            workspace_service::workspace_service_stop,
            workspace_service::workspace_service_status,
            workspace_service::workspace_service_autostart,
            transport::connect_hosted_workspace
        ])
        .build(tauri::generate_context!())
        .expect("Base desktop failed to initialize")
        .run(|app, event| {
            use std::sync::atomic::Ordering;
            use tauri::{Emitter, Manager};
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<lifecycle::Shutdown>();
                if state.ready.load(Ordering::SeqCst)
                    && !state.allowed.load(Ordering::SeqCst)
                    && app.get_webview_window("main").is_some()
                {
                    api.prevent_exit();
                    let _ = app.emit("base:exit-requested", ());
                }
            }
        });
}
