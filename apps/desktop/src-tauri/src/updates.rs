use std::sync::Mutex;
use tauri_plugin_updater::{Update, UpdaterExt};
pub struct Updates(pub Mutex<Option<Update>>);
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    updates: tauri::State<'_, Updates>,
) -> Result<Option<String>, String> {
    let public_key = option_env!("BASE_DESKTOP_UPDATER_PUBLIC_KEY")
        .filter(|v| !v.is_empty())
        .ok_or("Signed updates are not configured for this build.")?;
    let endpoint = option_env!("BASE_DESKTOP_UPDATER_URL")
        .filter(|v| v.starts_with("https://"))
        .ok_or("A secure updater endpoint is not configured for this build.")?;
    let updater = app
        .updater_builder()
        .pubkey(public_key)
        .endpoints(vec![endpoint.parse().map_err(|_| "Invalid update URL")?])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|update| update.version.clone());
    *updates.0.lock().map_err(|e| e.to_string())? = update;
    Ok(version)
}
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    updates: tauri::State<'_, Updates>,
) -> Result<(), String> {
    let update = updates
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Check for a signed update first.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}
