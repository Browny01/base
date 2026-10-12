mod protocol;
mod store;
use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use fs2::FileExt;
use rusqlite::params;
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use store::{hash, now, Store};
#[derive(Clone)]
struct App {
    store: Arc<Mutex<Store>>,
    directory: PathBuf,
    port: u16,
    public_origin: String,
}
fn error(code: StatusCode, message: impl Into<String>) -> Response {
    (code, Json(json!({"error":message.into()}))).into_response()
}
use axum::response::IntoResponse;
async fn boundaries(State(app): State<App>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if ![
        format!("127.0.0.1:{}", app.port),
        format!("localhost:{}", app.port),
        format!("[::1]:{}", app.port),
    ]
    .contains(&host.to_string())
        || request.headers().contains_key(header::ORIGIN)
    {
        return error(
            StatusCode::FORBIDDEN,
            "This workspace accepts native loopback connections only.",
        );
    }
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
}
fn token(headers: &axum::http::HeaderMap) -> &str {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
}
async fn health(State(app): State<App>) -> Json<Value> {
    let s = app.store.lock().unwrap();
    Json(
        json!({"product":"Base Workspace","version":env!("CARGO_PKG_VERSION"),"workspaceId":s.workspace,"status":"healthy"}),
    )
}
async fn login(State(app): State<App>, Json(body): Json<Value>) -> Response {
    let s = app.store.clone();
    let result = tokio::task::spawn_blocking(move || {
        s.lock()
            .map_err(|_| "Workspace unavailable".to_string())?
            .login(
                body["password"].as_str().unwrap_or(""),
                body["deviceId"].as_str().unwrap_or(""),
            )
    })
    .await;
    match result {
        Ok(Ok(v)) => Json(v).into_response(),
        Ok(Err(e)) => error(StatusCode::UNAUTHORIZED, e),
        Err(_) => error(StatusCode::SERVICE_UNAVAILABLE, "Workspace unavailable"),
    }
}
async fn api(State(app): State<App>, headers: axum::http::HeaderMap, request: Request) -> Response {
    let authentication = app.store.lock().unwrap().authenticate(token(&headers));
    if authentication.is_err() {
        return error(
            StatusCode::UNAUTHORIZED,
            "Session expired. Offline edits are retained.",
        );
    }
    let device = authentication.unwrap();
    let path = request.uri().path().to_owned();
    let method = request.method().clone();
    let query = request.uri().query().unwrap_or("").to_string();
    let body = match axum::body::to_bytes(request.into_body(), 33_000_000).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Request too large; your original data remains on the client.",
            )
        }
    };
    if path.starts_with("/api/files/") && method == axum::http::Method::GET {
        let id = path.trim_start_matches("/api/files/");
        if uuid::Uuid::parse_str(id).is_err() {
            return error(StatusCode::BAD_REQUEST, "Invalid file");
        }
        let mime: Result<String, _> = app.store.lock().unwrap().db.query_row(
            "SELECT mime FROM files WHERE id=?1 AND deleted=0",
            [id],
            |r| r.get(0),
        );
        let mime = match mime {
            Ok(v) => v,
            Err(_) => return error(StatusCode::NOT_FOUND, "File not found"),
        };
        let path = app.directory.join("files").join(id);
        return match std::fs::read(path) {
            Ok(bytes) => {
                let mut response = Response::new(Body::from(bytes));
                response.headers_mut().insert(
                    header::CONTENT_TYPE,
                    mime.parse()
                        .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
                );
                response
                    .headers_mut()
                    .insert(header::CONTENT_DISPOSITION, "attachment".parse().unwrap());
                response
            }
            Err(_) => error(StatusCode::NOT_FOUND, "File not found"),
        };
    }
    if path == "/api/blob/upload" && method == axum::http::Method::POST {
        return upload(&app, &headers, &query, body);
    }
    let result: Result<Value, String> = (|| {
        let mut s = app
            .store
            .lock()
            .map_err(|_| "Workspace unavailable".to_string())?;
        match (method.as_str(), path.as_str()) {
            ("GET", "/api/auth/desktop") => {
                Ok(json!({"workspaceId":s.workspace,"deviceId":device}))
            }
            ("DELETE", "/api/auth/desktop") => {
                s.db.execute(
                    "DELETE FROM sessions WHERE hash=?1",
                    [hash(token(&headers))],
                )
                .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            ("GET", "/api/native/sync") => {
                let (r, d) = s.snapshot()?;
                Ok(
                    json!({"protocol":2,"workspaceId":s.workspace,"revision":r,"data":d,"applied":[],"conflicts":[]}),
                )
            }
            ("POST", "/api/native/sync") => {
                s.sync(&serde_json::from_slice::<Value>(&body).map_err(|_| "Invalid JSON")?)
            }
            ("POST", "/api/native/sync/chunk") => {
                s.stage(&serde_json::from_slice::<Value>(&body).map_err(|_| "Invalid JSON")?)?;
                Ok(json!({"ok":true}))
            }
            ("GET", "/api/workspace") => {
                let (r, _) = s.snapshot()?;
                let mut statement =
                    s.db.prepare(
                        "SELECT device,max(expires) FROM sessions WHERE expires>?1 GROUP BY device",
                    )
                    .map_err(|e| e.to_string())?;
                let devices: Vec<Value> = statement
                    .query_map([now()], |r| {
                        Ok(json!({"id":r.get::<_,String>(0)?,"expiresAt":r.get::<_,i64>(1)?*1000}))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<_, _>>()
                    .map_err(|e| e.to_string())?;
                Ok(
                    json!({"id":s.workspace,"mode":"local","plan":"local","revision":r,"devices":devices,"storageBytes":storage_usage(&app.directory),"storageLimit":null}),
                )
            }
            ("GET", "/api/workspace/export") => {
                let (r, d) = s.snapshot()?;
                Ok(
                    json!({"format":"base-workspace-v1","workspaceId":s.workspace,"revision":r,"data":d}),
                )
            }
            ("POST", "/api/blob/delete") => {
                let b: Value = serde_json::from_slice(&body).map_err(|_| "Invalid JSON")?;
                let id = b["id"]
                    .as_str()
                    .or_else(|| {
                        b["url"]
                            .as_str()
                            .and_then(|v| v.rsplit("/api/files/").next())
                    })
                    .ok_or("Invalid file")?;
                if uuid::Uuid::parse_str(id).is_err() {
                    return Err("Invalid file".into());
                }
                s.db.execute("UPDATE files SET deleted=1 WHERE id=?1", [id])
                    .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            ("POST", "/api/devices/revoke") => {
                let b: Value = serde_json::from_slice(&body).map_err(|_| "Invalid JSON")?;
                let id = b["deviceId"].as_str().ok_or("Invalid device")?;
                s.db.execute("DELETE FROM sessions WHERE device=?1", [id])
                    .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            _ => Err("This integration is not configured on this workspace.".into()),
        }
    })();
    match result {
        Ok(value) => Json(value).into_response(),
        Err(e) => error(
            if e.contains("not configured") {
                StatusCode::NOT_IMPLEMENTED
            } else {
                StatusCode::BAD_REQUEST
            },
            e,
        ),
    }
}
fn storage_usage(path: &std::path::Path) -> u64 {
    std::fs::read_dir(path)
        .map(|items| {
            items
                .flatten()
                .map(|entry| {
                    let p = entry.path();
                    if p.is_dir() {
                        storage_usage(&p)
                    } else {
                        entry.metadata().map(|m| m.len()).unwrap_or(0)
                    }
                })
                .sum()
        })
        .unwrap_or(0)
}
fn upload(app: &App, headers: &axum::http::HeaderMap, query: &str, bytes: Bytes) -> Response {
    if bytes.is_empty() {
        return error(StatusCode::BAD_REQUEST, "Empty file");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let directory = app.directory.join("files");
    let path = directory.join(&id);
    let mime = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");
    let result = (|| {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let temp = directory.join(format!("{id}.pending"));
        let mut file = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&temp, &path).map_err(|e| e.to_string())?;
        std::fs::File::open(&directory)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        let s = app.store.lock().unwrap();
        s.db.execute(
            "INSERT INTO files(id,name,size,mime) VALUES(?1,?2,?3,?4)",
            params![
                id,
                url::form_urlencoded::parse(query.as_bytes())
                    .find(|(key, _)| key == "filename")
                    .map(|(_, value)| value.into_owned())
                    .unwrap_or_else(|| "Attachment".into()),
                bytes.len() as i64,
                mime
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    })();
    match result {
        Ok(()) => {
            Json(json!({"url":format!("{}/api/files/{id}",app.public_origin),"configured":true}))
                .into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(path);
            error(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}
async fn shutdown() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM listener");
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let directory = args
        .iter()
        .position(|v| v == "--directory")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .ok_or("Supply --directory")?;
    let port: u16 = args
        .iter()
        .position(|v| v == "--port")
        .and_then(|i| args.get(i + 1))
        .map(|v| v.parse())
        .transpose()?
        .unwrap_or(53318);
    std::fs::create_dir_all(&directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
    }
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join("service.lock"))?;
    lock.try_lock_exclusive()
        .map_err(|_| "Another workspace process owns this directory")?;
    let mut store = Store::open(&directory.join("workspace.sqlite3"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            directory.join("workspace.sqlite3"),
            std::fs::Permissions::from_mode(0o600),
        )?;
    }
    if args.iter().any(|v| v == "--initialize") {
        let mut raw = String::new();
        std::io::stdin().take(8192).read_to_string(&mut raw)?;
        let input: Value = serde_json::from_str(&raw)?;
        store.initialize(input["password"].as_str().ok_or("Password missing")?)?;
        println!("{}", json!({"workspaceId":store.workspace}));
        return Ok(());
    }
    let public_origin = if let Some(value) = args
        .iter()
        .position(|v| v == "--public-url")
        .and_then(|i| args.get(i + 1))
    {
        let url = url::Url::parse(value)?;
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Use an HTTPS public origin without credentials, path or query".into());
        }
        url.origin().ascii_serialization()
    } else {
        format!("http://127.0.0.1:{port}")
    };
    let app = App {
        store: Arc::new(Mutex::new(store)),
        directory,
        port,
        public_origin,
    };
    let router = Router::new()
        .route("/health", get(health))
        .route("/api/auth/login", post(login))
        .fallback(api)
        .layer(DefaultBodyLimit::max(33_000_000))
        .layer(middleware::from_fn_with_state(app.clone(), boundaries))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("Base Workspace listening on http://127.0.0.1:{port}");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown())
        .await?;
    FileExt::unlock(&lock)?;
    Ok(())
}
