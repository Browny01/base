use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_updater::{Update, UpdaterExt};
pub struct Updates(pub Mutex<Option<Update>>);
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    updates: tauri::State<'_, Updates>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_none() {
        return Err("In-app updates use the Base AppImage edition. Update DEB/RPM installations through your package manager or a replacement installer.".into());
    }
    let mut builder = app.updater_builder();
    if let Some(public_key) =
        option_env!("BASE_DESKTOP_UPDATER_PUBLIC_KEY").filter(|v| !v.is_empty())
    {
        builder = builder.pubkey(public_key);
    }
    if let Some(endpoint) = option_env!("BASE_DESKTOP_UPDATER_URL") {
        if !endpoint.starts_with("https://") {
            return Err("Secure updates require HTTPS.".into());
        }
        builder = builder
            .endpoints(vec![endpoint.parse().map_err(|_| "Invalid update URL")?])
            .map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
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
    let result = update
        .download_and_install(
            |chunk, total| {
                let _ = app.emit(
                    "base:update-progress",
                    serde_json::json!({"chunk":chunk,"total":total,"installing":false}),
                );
            },
            || {
                let _ = app.emit(
                    "base:update-progress",
                    serde_json::json!({"installing":true}),
                );
            },
        )
        .await;
    if let Err(error) = result {
        updates
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .get_or_insert(update);
        return Err(error.to_string());
    }
    app.restart();
}
