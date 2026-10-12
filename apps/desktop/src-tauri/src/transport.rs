use crate::database::{Database, Workspace};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{Client, Method};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use url::Url;

pub struct Transport {
    client: Client,
}
impl Transport {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("HTTP client initialization failed"),
        }
    }
}
const PATHS: &[&str] = &[
    "/api/native/sync",
    "/api/native/sync/chunk",
    "/api/auth/desktop",
    "/api/workspace",
    "/api/workspace/credentials",
    "/api/workspace/export",
    "/api/workspace/integrations/revoke",
    "/api/devices/revoke",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/api/news",
    "/api/news/summary",
    "/api/social-feed",
    "/api/live-status",
    "/api/market/charts",
    "/api/market/prices",
    "/api/fx/rate",
    "/api/wallet/balance",
    "/api/wallet/tokens",
    "/api/calcom/bookings",
    "/api/blob/upload",
    "/api/blob/delete",
    "/api/link-preview",
    "/api/favicon",
    "/api/tmdb/search",
    "/api/youtube/oembed",
    "/api/youtube/channel",
];
fn managed_cloud_origin() -> String {
    let config: Value =
        serde_json::from_str(include_str!("../../../../packages/core/src/service.json"))
            .expect("Bundled cloud configuration");
    config["cloudUrl"]
        .as_str()
        .expect("Bundled cloud URL")
        .to_string()
}
fn integration_provider(path: &str) -> Option<&'static str> {
    match path.split('?').next().unwrap_or("") {
        "/api/tmdb/search" => Some("tmdb"),
        "/api/market/charts" | "/api/market/prices" => Some("coingecko"),
        "/api/calcom/bookings" => Some("calcom"),
        "/api/social-feed" => Some("x"),
        _ => None,
    }
}
fn public_integration(path: &str) -> bool {
    matches!(
        path.split('?').next().unwrap_or(""),
        "/api/news"
            | "/api/news/summary"
            | "/api/market/charts"
            | "/api/market/prices"
            | "/api/fx/rate"
            | "/api/social-feed"
            | "/api/live-status"
            | "/api/tmdb/search"
            | "/api/youtube/oembed"
            | "/api/youtube/channel"
            | "/api/calcom/bookings"
            | "/api/wallet/balance"
            | "/api/wallet/tokens"
    )
}
fn integration_entry(scope: &str, provider: &str) -> Result<keyring::Entry, String> {
    if !["tmdb", "calcom", "x", "coingecko"].contains(&provider) {
        return Err("Unsupported integration".into());
    }
    keyring::Entry::new(
        "app.base.personal.desktop.integrations",
        &format!("{scope}:{provider}"),
    )
    .map_err(|_| "Secure credential storage is unavailable".into())
}
#[tauri::command]
pub fn integration_status(db: tauri::State<'_, Database>, scope: String) -> Result<Value, String> {
    workspace(&db, &scope)?;
    let providers: Vec<Value> = ["tmdb", "calcom", "x", "coingecko"].iter().map(|provider| Ok(json!({"id":provider,"configured":integration_entry(&scope, provider)?.get_password().is_ok()}))).collect::<Result<_, String>>()?;
    Ok(json!({"providers":providers}))
}
#[tauri::command]
pub fn set_integration_key(
    db: tauri::State<'_, Database>,
    scope: String,
    provider: String,
    key: Option<String>,
) -> Result<(), String> {
    workspace(&db, &scope)?;
    let entry = integration_entry(&scope, &provider)?;
    if let Some(key) = key {
        let value = key.trim();
        if value.is_empty() || value.len() > 8192 || value.contains(['\r', '\n']) {
            return Err("Enter a valid integration key".into());
        }
        entry
            .set_password(value)
            .map_err(|_| "Could not securely save the integration key".to_string())?;
    } else {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err("Could not remove the integration key".into()),
        }
    }
    db.0.lock().map_err(|e| e.to_string())?.execute("DELETE FROM response_cache WHERE scope=?1 AND (key LIKE '/api/tmdb/%' OR key LIKE '/api/calcom/%' OR key LIKE '/api/social-feed%' OR key LIKE '/api/market/%')", [&scope]).map_err(|e| e.to_string())?;
    Ok(())
}
fn normalized_origin(origin: &str) -> Result<String, String> {
    let parsed = Url::parse(origin).map_err(|_| "Enter a valid service URL.")?;
    let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (parsed.scheme() != "https" && !(parsed.scheme() == "http" && local))
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Use an HTTPS origin without a path, password or query. HTTP is allowed only for loopback development.".into());
    }
    Ok(parsed.origin().ascii_serialization())
}
fn scoped_url(origin: &str, path: &str) -> Result<Url, String> {
    if !path.starts_with("/api/") || path.contains('\\') || path.contains('#') || path.len() > 8192
    {
        return Err("Unsupported API path".into());
    }
    let url = Url::parse(&format!("{origin}{path}")).map_err(|e| e.to_string())?;
    if url.origin().ascii_serialization() != origin
        || !(PATHS.contains(&url.path())
            || url
                .path()
                .strip_prefix("/api/files/")
                .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok()))
    {
        return Err("API path is outside the desktop permissions".into());
    }
    Ok(url)
}
fn credential(scope: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.base.personal.desktop", scope)
        .map_err(|_| "The operating system credential store is unavailable.".into())
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    status: u16,
    content_type: String,
    body_base64: String,
    cached: bool,
}
async fn response_bytes(mut response: reqwest::Response) -> Result<ApiResponse, String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_owned();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The connection interrupted the response.")?
    {
        if bytes.len() + chunk.len() > 128 * 1024 * 1024 {
            return Err("Server response exceeded the safety limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ApiResponse {
        status,
        content_type,
        body_base64: STANDARD.encode(bytes),
        cached: false,
    })
}
fn workspace(db: &Database, scope: &str) -> Result<Workspace, String> {
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    if Database::active_scope(&connection)? != scope {
        return Err("Workspace changed; request canceled.".into());
    }
    Database::load(&connection, scope)
}
fn cached(db: &Database, scope: &str, path: &str) -> Option<ApiResponse> {
    use rusqlite::OptionalExtension;
    let connection = db.0.lock().ok()?;
    let raw: Option<String> = connection
        .query_row(
            "SELECT payload FROM response_cache WHERE scope=?1 AND key=?2",
            params![scope, path],
            |r| r.get(0),
        )
        .optional()
        .ok()?;
    let mut value: ApiResponse = serde_json::from_str(&raw?).ok()?;
    value.cached = true;
    let _ = connection.execute(
        "UPDATE response_cache SET touched=unixepoch() WHERE scope=?1 AND key=?2",
        params![scope, path],
    );
    Some(value)
}
fn cache(db: &Database, scope: &str, path: &str, response: &ApiResponse) {
    if response.body_base64.len() > 12 * 1024 * 1024 {
        return;
    }
    let Ok(mut connection) = db.0.lock() else {
        return;
    };
    let Ok(transaction) = connection.transaction() else {
        return;
    };
    let payload = serde_json::to_string(response).unwrap_or_default();
    let _ = transaction.execute("INSERT INTO response_cache(scope,key,payload,bytes) VALUES(?1,?2,?3,?4) ON CONFLICT(scope,key) DO UPDATE SET payload=excluded.payload,bytes=excluded.bytes,touched=unixepoch()", params![scope,path,payload,payload.len() as i64]);
    loop {
        let bytes: i64 = transaction
            .query_row(
                "SELECT coalesce(sum(bytes),0) FROM response_cache",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if bytes <= 32 * 1024 * 1024 {
            break;
        }
        if transaction.execute("DELETE FROM response_cache WHERE rowid IN (SELECT rowid FROM response_cache ORDER BY touched,rowid LIMIT 1)", []).unwrap_or(0) == 0 { break; }
    }
    let _ = transaction.commit();
}

#[tauri::command]
pub async fn cache_media(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    scope: String,
    url: String,
) -> Result<ApiResponse, String> {
    let workspace = workspace(&db, &scope)?;
    let parsed = Url::parse(&url).map_err(|_| "Invalid media URL")?;
    let host = parsed.host_str().unwrap_or("");
    let private_attachment = parsed.origin().ascii_serialization() == workspace.origin
        && parsed
            .path()
            .strip_prefix("/api/files/")
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok());
    let permitted = private_attachment
        || host.ends_with(".public.blob.vercel-storage.com")
        || matches!(
            host,
            "assets.coingecko.com"
                | "image.tmdb.org"
                | "i.ytimg.com"
                | "images.unsplash.com"
                | "unavatar.io"
        );
    if (parsed.scheme() != "https" && !private_attachment)
        || !permitted
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("This media host is not supported by the offline cache.".into());
    }
    let key = format!("media:{url}");
    if let Some(response) = cached(&db, &scope, &key) {
        return Ok(response);
    }
    let request = transport.client.get(parsed);
    let request = if private_attachment {
        request.bearer_auth(
            credential(&scope)?
                .get_password()
                .map_err(|_| "Reconnect this workspace to view its attachments")?,
        )
    } else {
        request
    };
    let response = request
        .send()
        .await
        .map_err(|_| "Media is not cached and the service is offline.")?;
    if !response.status().is_success() || response.content_length().unwrap_or(0) > 8 * 1024 * 1024 {
        return Err("Media is unavailable or exceeds the 8 MB cache limit.".into());
    }
    let response = response_bytes(response).await?;
    workspace_scope_check(&db, &scope)?;
    if !response.content_type.starts_with("image/") || response.body_base64.len() > 12 * 1024 * 1024
    {
        return Err("Unsupported media type or size.".into());
    }
    cache(&db, &scope, &key, &response);
    Ok(response)
}

#[tauri::command]
pub async fn api_request(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    scope: String,
    path: String,
    method: String,
    body_base64: Option<String>,
    content_type: Option<String>,
) -> Result<ApiResponse, String> {
    let workspace = workspace(&db, &scope)?;
    let cacheable = method == "GET"
        && !matches!(
            path.split('?').next(),
            Some("/api/native/sync" | "/api/auth/desktop")
        );
    let provider_key = if let Some(provider) = integration_provider(&path) {
        integration_entry(&scope, provider)?.get_password().ok()
    } else {
        None
    };
    // Keep legacy Vercel integrations and server-side keys working. Standalone
    // Rust workspaces have a 43-character, URL-safe identity; offline scopes
    // have no origin. An explicit per-device key also opts into this adapter.
    let local_integration = public_integration(&path)
        && (provider_key.is_some()
            || workspace.origin.is_empty()
            || (workspace.workspace_id.len() == 43
                && workspace
                    .workspace_id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')));
    if workspace.origin.is_empty() && !local_integration {
        return cached(&db, &scope, &path).ok_or_else(|| {
            "This action needs a connected workspace. Offline records remain available.".into()
        });
    }
    let url = if local_integration {
        let validated = scoped_url(&managed_cloud_origin(), &path)?;
        let mut public_url = validated;
        public_url.set_path(&format!(
            "/api/public/{}",
            public_url.path().trim_start_matches("/api/")
        ));
        public_url
    } else {
        scoped_url(&workspace.origin, &path)?
    };
    let token = if local_integration {
        None
    } else {
        match credential(&scope)?.get_password() {
            Ok(token) => Some(token),
            Err(_) => {
                if cacheable {
                    if let Some(value) = cached(&db, &scope, &path) {
                        return Ok(value);
                    }
                }
                return Err("Sign in to synchronize. Your offline changes are retained.".into());
            }
        }
    };
    if !matches!(method.as_str(), "GET" | "POST" | "DELETE") {
        return Err("Unsupported request method".into());
    }
    let file_upload = url.path() == "/api/blob/upload";
    let method_value = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut request = transport.client.request(method_value, url);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if local_integration {
        if let (Some(provider), Some(key)) = (integration_provider(&path), provider_key) {
            request = request.header(format!("X-Base-Key-{provider}"), key);
        }
    }
    if let Some(body) = body_base64 {
        let bytes = STANDARD
            .decode(body)
            .map_err(|_| "Invalid request encoding")?;
        if bytes.len() > (if file_upload { 128 } else { 16 }) * 1024 * 1024 {
            return Err("Upload exceeded the safety limit.".into());
        }
        request = request.body(bytes);
    }
    if let Some(content_type) = content_type {
        request = request.header("content-type", content_type);
    }
    let fetched = match request.send().await {
        Ok(response) => response_bytes(response).await,
        Err(_) => {
            Err("Base could not reach the service. Your offline changes are retained.".into())
        }
    };
    // Account switches while the network is in flight must not leak a response
    // or populate a different account's cache.
    workspace_scope_check(&db, &scope)?;
    match fetched {
        Ok(response) if response.status < 500 => {
            if cacheable && response.status == 200 {
                cache(&db, &scope, &path, &response);
            }
            Ok(response)
        }
        other => {
            if cacheable {
                if let Some(value) = cached(&db, &scope, &path) {
                    return Ok(value);
                }
            }
            other
        }
    }
}
fn workspace_scope_check(db: &Database, scope: &str) -> Result<(), String> {
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    if Database::active_scope(&connection)? == scope {
        Ok(())
    } else {
        Err("Workspace changed during request.".into())
    }
}

#[tauri::command]
pub async fn connect_account(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    origin: String,
    password: String,
    defaults: Value,
) -> Result<Workspace, String> {
    let origin = normalized_origin(&origin)?;
    if password.is_empty() || password.len() > 4096 || !defaults.is_object() {
        return Err("Invalid login details".into());
    }
    let device_id = device_id(&db)?;
    let response = transport
        .client
        .post(format!("{origin}/api/auth/login"))
        .json(&json!({"client":"desktop","deviceId":device_id,"password":password}))
        .send()
        .await
        .map_err(|_| "Could not reach the login service.")?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|_| "Invalid login response")?;
    if !status.is_success() {
        return Err(body["error"].as_str().unwrap_or("Login failed").into());
    }
    let token = body["token"]
        .as_str()
        .filter(|t| t.starts_with("base_desktop_"))
        .ok_or("Deploy the desktop API before connecting this app.")?;
    let workspace_id = body["workspaceId"]
        .as_str()
        .filter(|id| id.len() >= 16 && id.len() < 200)
        .ok_or("Invalid workspace identity")?;
    let scope = format!("{:x}", Sha256::digest(format!("{origin}/{workspace_id}")));
    let saved = credential(&scope).and_then(|entry| entry.set_password(token).map_err(|_| "Could not save the session in the OS credential store. Unlock your keychain or Secret Service.".into()));
    if let Err(error) = saved {
        let _ = transport
            .client
            .delete(format!("{origin}/api/auth/desktop"))
            .bearer_auth(token)
            .send()
            .await;
        return Err(error);
    }
    crate::note_lock::remember(&scope, &password)?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    Database::activate(&mut connection, &scope, &origin, workspace_id, &defaults)
}
#[tauri::command]
pub async fn disconnect_account(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    defaults: Value,
) -> Result<Workspace, String> {
    let current = {
        let connection = db.0.lock().map_err(|e| e.to_string())?;
        Database::load(&connection, &Database::active_scope(&connection)?)?
    };
    if !current.origin.is_empty() {
        let entry = credential(&current.scope)?;
        if let Ok(token) = entry.get_password() {
            let _ = transport
                .client
                .delete(format!("{}/api/auth/desktop", current.origin))
                .bearer_auth(token)
                .send()
                .await;
        }
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(_) => return Err("Unable to remove the session from the credential store.".into()),
        }
    }
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let offline = crate::imports::last_offline_scope(&connection)?;
    Database::activate(&mut connection, &offline, "", "", &defaults)
}
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "Invalid external URL")?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Unsupported external URL".into());
    }
    open::that_detached(parsed.as_str()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_workspace(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
    unsaved: Option<Value>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let snapshot = {
        let connection = db.0.lock().map_err(|e| e.to_string())?;
        Database::load(&connection, &Database::active_scope(&connection)?)?
    };
    let path = app
        .dialog()
        .file()
        .set_file_name("base-workspace.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    let Some(path) = path else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let imports = {
        let connection = db.0.lock().map_err(|e| e.to_string())?;
        let mut statement = connection
            .prepare("SELECT value FROM metadata WHERE key LIKE ?1 OR key LIKE ?2")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(
                [
                    format!("import:{}:%", snapshot.scope),
                    format!("recovery:{}:%", snapshot.scope),
                ],
                |r| r.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows.into_iter()
            .map(|raw| serde_json::from_str::<Value>(&raw))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let bytes = serde_json::to_vec_pretty(
        &json!({"workspace":snapshot,"unsaved":unsaved,"importedSources":imports}),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins_and_paths_reject_privilege_escape() {
        assert!(normalized_origin("https://base.test").is_ok());
        assert!(normalized_origin("http://127.0.0.1:3000").is_ok());
        for origin in [
            "http://base.test",
            "https://user:pass@base.test",
            "file:///tmp",
            "https://base.test/path",
            "https://base.test?secret=x",
        ] {
            assert!(normalized_origin(origin).is_err());
        }
        for path in [
            "//evil.test/api/news",
            "/api/agent/tasks",
            "/api/mcp",
            "/api/cron/snapshot",
            "/api/news/../../api/data",
            "/api/news#fragment",
        ] {
            assert!(scoped_url("https://base.test", path).is_err());
        }
        assert!(scoped_url("https://base.test", "/api/news?source=base").is_ok());
    }
}

#[tauri::command]
pub fn print_document(app: tauri::AppHandle, html: String) -> Result<(), String> {
    if html.len() > 8 * 1024 * 1024 {
        return Err("This note is too large to print in one document.".into());
    }
    let script = format!(
        "document.open();document.write({});document.close();",
        serde_json::to_string(&html).map_err(|e| e.to_string())?
    );
    let label = format!("print-{}", uuid::Uuid::new_v4());
    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("desktop-print.html".into()),
    )
    .title("Base — Print")
    .inner_size(800.0, 900.0)
    // Print windows have no capability to access accounts, SQL or files.
    .on_navigation(|url| url.path() == "/desktop-print.html")
    .on_page_load(move |view, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = view.eval(&script);
            let _ = view.print();
        }
    })
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn connect_hosted_workspace(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    app: tauri::AppHandle,
    defaults: Value,
) -> Result<Workspace, String> {
    let status = crate::workspace_service::workspace_service_status(app.clone()).await?;
    if status["running"] != true {
        return Err("Start your local workspace first.".into());
    }
    let workspace = connect_account(
        db,
        transport,
        "http://127.0.0.1:53318".into(),
        crate::workspace_service::hosted_password(&app)?,
        defaults,
    )
    .await?;
    // A generated service password is never presented as the user's note password.
    // Local note protection instead has a separate OS-stored verifier.
    Ok(workspace)
}

fn device_id(db: &Database) -> Result<String, String> {
    use rusqlite::OptionalExtension;
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    let device: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key='device_id'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(device) = device {
        Ok(device)
    } else {
        let device = uuid::Uuid::new_v4().to_string();
        connection
            .execute(
                "INSERT INTO metadata(key,value) VALUES('device_id',?1)",
                [&device],
            )
            .map_err(|e| e.to_string())?;
        Ok(device)
    }
}

#[derive(Default)]
pub struct CloudLogin(pub std::sync::Mutex<Option<PendingCloudLogin>>);
pub struct PendingCloudLogin {
    origin: String,
    id: String,
    verifier: String,
    expires_at: u64,
}
async fn auth_json(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let response = response_bytes(response).await?;
    let bytes = STANDARD
        .decode(response.body_base64)
        .map_err(|_| "Invalid sign-in response")?;
    if bytes.len() > 65536 {
        return Err("Invalid sign-in response".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid sign-in response")?;
    if !status.is_success() {
        return Err(value["error"]
            .as_str()
            .unwrap_or("Cloud sign-in is unavailable")
            .into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn cloud_sign_in_start(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    login: tauri::State<'_, CloudLogin>,
) -> Result<Value, String> {
    let origin = normalized_origin(&managed_cloud_origin())?;
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = format!("{:x}", Sha256::digest(verifier.as_bytes()));
    let result = auth_json(
        transport
            .client
            .post(format!("{origin}/api/auth/device/start"))
            .json(&json!({"challenge":challenge,"deviceId":device_id(&db)?}))
            .send()
            .await
            .map_err(|_| "Could not reach Base Cloud")?,
    )
    .await?;
    let id = result["id"]
        .as_str()
        .filter(|id| {
            id.len() == 43
                && id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
        .ok_or("Invalid sign-in identity")?
        .to_string();
    let url = Url::parse(
        result["verificationUrl"]
            .as_str()
            .ok_or("Missing sign-in URL")?,
    )
    .map_err(|_| "Invalid sign-in URL")?;
    if url.origin().ascii_serialization() != origin
        || url.path() != "/sign-in"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Sign-in URL is outside Base Cloud".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let expires_at = result["expiresAt"]
        .as_u64()
        .filter(|time| *time > now && *time <= now + 610000)
        .ok_or("Sign-in expiry is invalid")?;
    *login.0.lock().map_err(|e| e.to_string())? = Some(PendingCloudLogin {
        origin,
        id,
        verifier,
        expires_at,
    });
    open::that(url.as_str()).map_err(|_| "Could not open your system browser")?;
    Ok(json!({"expiresAt":expires_at}))
}
#[tauri::command]
pub async fn cloud_sign_in_finish(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    login: tauri::State<'_, CloudLogin>,
    defaults: Value,
) -> Result<Workspace, String> {
    let (origin, id, verifier, expires_at) = {
        let guard = login.0.lock().map_err(|e| e.to_string())?;
        let pending = guard.as_ref().ok_or("Start sign-in first")?;
        (
            pending.origin.clone(),
            pending.id.clone(),
            pending.verifier.clone(),
            pending.expires_at,
        )
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    if now >= expires_at {
        return Err("Sign-in expired; start again. Your offline data is retained.".into());
    }
    let result = auth_json(
        transport
            .client
            .post(format!("{origin}/api/auth/device/exchange"))
            .json(&json!({"id":id,"verifier":verifier}))
            .send()
            .await
            .map_err(|_| "Could not reach Base Cloud")?,
    )
    .await?;
    let token = result["token"]
        .as_str()
        .filter(|token| token.len() == 56 && token.starts_with("base_desktop_"))
        .ok_or("Invalid Cloud session")?;
    let workspace_id = result["workspaceId"]
        .as_str()
        .filter(|id| id.starts_with("base_cloud_") && id.len() == 51)
        .ok_or("Invalid Cloud workspace identity")?;
    let scope = format!("{:x}", Sha256::digest(format!("{origin}/{workspace_id}")));
    credential(&scope)?
        .set_password(token)
        .map_err(|_| "Unlock your OS credential store, then sign in again")?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    connection.execute("INSERT INTO metadata(key,value) VALUES(?1,'cloud') ON CONFLICT(key) DO UPDATE SET value=excluded.value",[format!("workspace_kind:{scope}")]).map_err(|e|e.to_string())?;
    let workspace = Database::activate(&mut connection, &scope, &origin, workspace_id, &defaults)?;
    *login.0.lock().map_err(|e| e.to_string())? = None;
    Ok(workspace)
}

#[tauri::command]
pub async fn download_workspace_file(
    db: tauri::State<'_, Database>,
    transport: tauri::State<'_, Transport>,
    app: tauri::AppHandle,
    scope: String,
    id: String,
    name: String,
) -> Result<bool, String> {
    use std::io::Write;
    use tauri_plugin_dialog::DialogExt;
    let current = workspace(&db, &scope)?;
    if uuid::Uuid::parse_str(&id).is_err() || current.origin.is_empty() {
        return Err("Invalid workspace attachment".into());
    }
    let filename = name.rsplit(['/', '\\']).next().unwrap_or("Attachment");
    let filename: String = filename
        .chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect();
    let chosen = app
        .dialog()
        .file()
        .set_file_name(if filename.is_empty() {
            "Attachment"
        } else {
            &filename
        })
        .blocking_save_file();
    let Some(chosen) = chosen else {
        return Ok(false);
    };
    let path = chosen
        .into_path()
        .map_err(|_| "Choose a local file destination")?;
    workspace_scope_check(&db, &scope)?;
    let token = credential(&scope)?
        .get_password()
        .map_err(|_| "Reconnect this workspace to download its files")?;
    let mut response = transport
        .client
        .get(scoped_url(&current.origin, &format!("/api/files/{id}"))?)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "The file is unavailable while offline")?;
    if !response.status().is_success() {
        return Err("The file is unavailable or your session expired".into());
    }
    let parent = path.parent().ok_or("Invalid file destination")?;
    let temporary = parent.join(format!(".base-download-{}.part", uuid::Uuid::new_v4()));
    let result = async {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        let mut bytes = 0usize;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "The download was interrupted; the server copy is retained")?
        {
            bytes += chunk.len();
            if bytes > 128 * 1024 * 1024 {
                return Err("The file exceeds the download safety limit".to_owned());
            }
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        file.sync_all().map_err(|e| e.to_string())?;
        workspace_scope_check(&db, &scope)?;
        std::fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        Ok::<_, String>(true)
    }
    .await;
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}
