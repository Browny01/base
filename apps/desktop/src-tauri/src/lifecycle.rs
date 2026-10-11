use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
#[derive(Default)]
pub struct Shutdown {
    pub ready: AtomicBool,
    pub allowed: AtomicBool,
}
#[tauri::command]
pub fn shutdown_ready(state: tauri::State<'_, Shutdown>) {
    state.ready.store(true, Ordering::SeqCst);
}
#[tauri::command]
pub fn finish_exit(app: tauri::AppHandle, state: tauri::State<'_, Shutdown>) {
    state.allowed.store(true, Ordering::SeqCst);
    app.exit(0);
}
#[tauri::command]
pub fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}
