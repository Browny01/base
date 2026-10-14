#[tauri::command]
pub async fn notification_permission(request: bool) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use mac_usernotifications::{get_notification_settings, request_auth, AuthorizationStatus};
        if request {
            request_auth().await.map_err(|e| e.to_string())?;
        }
        let status = get_notification_settings()
            .await
            .map_err(|e| e.to_string())?
            .authorization_status;
        Ok(match status {
            AuthorizationStatus::Authorized
            | AuthorizationStatus::Provisional
            | AuthorizationStatus::Ephemeral => "granted",
            AuthorizationStatus::NotDetermined => "default",
            _ => "denied",
        }
        .into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Ok("granted".into())
    }
}
#[tauri::command]
pub async fn send_notification(title: String, body: String) -> Result<(), String> {
    if title.is_empty() || title.len() > 256 || body.len() > 4096 {
        return Err("Invalid notification text.".into());
    }
    #[cfg(target_os = "macos")]
    {
        mac_usernotifications::Notification::new()
            .title(&title)
            .message(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    tauri::async_runtime::spawn_blocking(move || {
        notify_rust::Notification::new()
            .appname("Base")
            .summary(&title)
            .body(&body)
            .show()
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
