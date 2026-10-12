//! Only the fixed Base workspace executable/unit is managed. No shell, arbitrary
//! paths, public listener, credentials or generic process API reach JavaScript.
use crate::database::Database;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::Manager;
#[cfg(target_os = "macos")]
const LABEL: &str = "app.base.workspace";
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("hosted-workspace"))
}
fn password_entry(app: &tauri::AppHandle) -> Result<keyring::Entry, String> {
    use sha2::{Digest, Sha256};
    let scope = format!(
        "local-workspace-host-{:x}",
        Sha256::digest(directory(app)?.to_string_lossy().as_bytes())
    );
    keyring::Entry::new("app.base.personal.desktop", &scope).map_err(|e| e.to_string())
}
fn bundled_executable() -> Result<PathBuf, String> {
    let app = std::env::current_exe().map_err(|e| e.to_string())?;
    let installed = app
        .parent()
        .ok_or("App location unavailable")?
        .join("base-workspace");
    if installed.is_file() {
        return Ok(installed);
    }
    // Tauri development executable lives in target/debug or target/release.
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(concat!("base-workspace-", env!("BASE_TARGET_TRIPLE")));
    if source.is_file() {
        Ok(source)
    } else {
        Err("Base Workspace is not bundled. Rebuild with npm run desktop:build.".into())
    }
}
fn executable(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    let source = bundled_executable()?;
    // AppImage mounts are temporary. A fixed private copy lets systemd/launchd
    // restart the backend even after its UI and mount have disappeared.
    let folder = directory(app)?.join("service-bin");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let target = folder.join("base-workspace");
    let bytes = std::fs::read(source).map_err(|e| e.to_string())?;
    let same = std::fs::read(&target)
        .ok()
        .is_some_and(|old| Sha256::digest(old) == Sha256::digest(&bytes));
    if !same {
        let temp = folder.join("base-workspace.pending");
        let mut file = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        std::fs::rename(temp, &target).map_err(|e| e.to_string())?;
        std::fs::File::open(&folder)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
    }
    Ok(target)
}
fn run(program: &str, args: &[&str]) -> Result<(), String> {
    let result = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err(format!(
            "Workspace service management failed: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(())
}
#[cfg(target_os = "linux")]
fn unit_path(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|v| PathBuf::from(v).join(".config")))
        .ok_or("User configuration unavailable")?;
    Ok(config.join("systemd/user/base-workspace.service"))
}
#[cfg(target_os = "macos")]
fn unit_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(directory(app)?.join("app.base.workspace.plist"))
}
#[cfg(target_os = "macos")]
fn login_path() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("HOME").ok_or("User configuration unavailable")?)
            .join("Library/LaunchAgents/app.base.workspace.plist"),
    )
}
#[cfg(target_os = "linux")]
fn install(app: &tauri::AppHandle) -> Result<(), String> {
    let binary = executable(app)?;
    let dir = directory(app)?;
    let unit = unit_path(app)?;
    std::fs::create_dir_all(unit.parent().unwrap()).map_err(|e| e.to_string())?;
    let quote = |path: &Path| -> Result<String, String> {
        let p = path.to_str().ok_or("Unsupported service path")?;
        if p.contains(['\n', '\r']) {
            return Err("Invalid service path".into());
        }
        Ok(format!(
            "\"{}\"",
            p.replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('%', "%%")
                .replace('$', "$$")
        ))
    };
    let content=format!("[Unit]\nDescription=Base Local Workspace\nAfter=network.target\nStartLimitIntervalSec=60\nStartLimitBurst=3\n[Service]\nType=simple\nExecStart={} --directory {}\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=30\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6\n[Install]\nWantedBy=default.target\n",quote(&binary)?,quote(&dir)?);
    if std::fs::read_to_string(&unit).ok().as_deref() != Some(&content) {
        std::fs::write(unit, content).map_err(|e| e.to_string())?;
        run("systemctl", &["--user", "daemon-reload"])?;
    }
    Ok(())
}
#[cfg(target_os = "macos")]
fn install(app: &tauri::AppHandle) -> Result<(), String> {
    let escape = |path: PathBuf| -> Result<String, String> {
        Ok(path
            .to_str()
            .ok_or("Unsupported service path")?
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;"))
    };
    let unit = unit_path(app)?;
    let dir = directory(app)?;
    std::fs::create_dir_all(unit.parent().unwrap()).map_err(|e| e.to_string())?;
    let content=format!("<?xml version=\"1.0\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>Label</key><string>{LABEL}</string><key>ProgramArguments</key><array><string>{}</string><string>--directory</string><string>{}</string></array><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>RunAtLoad</key><false/><key>ThrottleInterval</key><integer>2</integer><key>Umask</key><integer>63</integer><key>StandardErrorPath</key><string>{}</string></dict></plist>",escape(executable(app)?)?,escape(dir.clone())?,escape(dir.join("service.log"))?);
    std::fs::write(unit, content).map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(target_os = "macos")]
fn user_domain() -> Result<String, String> {
    let output = Command::new("id")
        .arg("-u")
        .output()
        .map_err(|e| e.to_string())?;
    let uid = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    if !uid.trim().chars().all(|c| c.is_ascii_digit()) {
        return Err("User identity unavailable".into());
    }
    Ok(format!("gui/{}", uid.trim()))
}
fn initialized(app: &tauri::AppHandle) -> Result<bool, String> {
    let path = directory(app)?.join("workspace.sqlite3");
    if !path.exists() {
        return Ok(false);
    }
    let db =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
    Ok(db
        .query_row("SELECT value FROM metadata WHERE key='password'", [], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .is_some())
}
#[tauri::command]
pub async fn workspace_service_start(app: tauri::AppHandle) -> Result<Value, String> {
    if !initialized(&app)? {
        let secret = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        password_entry(&app)?
            .set_password(&secret)
            .map_err(|_| "Unlock your OS credential store to start a workspace")?;
        let dir = directory(&app)?;
        let mut child = Command::new(executable(&app)?)
            .args([
                "--directory",
                dir.to_str().ok_or("Invalid directory")?,
                "--initialize",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        child
            .stdin
            .take()
            .ok_or("Service input unavailable")?
            .write_all(json!({"password":secret}).to_string().as_bytes())
            .map_err(|e| e.to_string())?;
        let result = child.wait_with_output().map_err(|e| e.to_string())?;
        if !result.status.success() {
            return Err(
                "Could not initialize the local workspace. Existing data was not changed.".into(),
            );
        }
    }
    install(&app)?;
    #[cfg(target_os = "linux")]
    {
        // A newly installed unit has no failed state and may not yet be loaded.
        // Startup itself must still succeed; resetting a missing state is benign.
        let _ = run(
            "systemctl",
            &["--user", "reset-failed", "base-workspace.service"],
        );
        run("systemctl", &["--user", "start", "base-workspace.service"])?;
    }
    #[cfg(target_os = "macos")]
    {
        let domain = user_domain()?;
        let unit = unit_path(&app)?;
        if Command::new("launchctl")
            .args(["print", &format!("{domain}/{LABEL}")])
            .output()
            .map_err(|e| e.to_string())?
            .status
            .success()
        {
            run("launchctl", &["kickstart", &format!("{domain}/{LABEL}")])?;
        } else {
            run(
                "launchctl",
                &[
                    "bootstrap",
                    &domain,
                    unit.to_str().ok_or("Invalid unit path")?,
                ],
            )?;
            run("launchctl", &["kickstart", &format!("{domain}/{LABEL}")])?;
        }
    }
    for _ in 0..12 {
        let status = workspace_service_status(app.clone()).await?;
        if status["running"] == true {
            return Ok(status);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    // A failed first launch must not leave a permanent restart loop behind.
    #[cfg(target_os = "linux")]
    let _ = run("systemctl", &["--user", "stop", "base-workspace.service"]);
    #[cfg(target_os = "macos")]
    if let Ok(domain) = user_domain() {
        let _ = run("launchctl", &["bootout", &format!("{domain}/{LABEL}")]);
    }
    Err(
        "The workspace did not become healthy. Check service status; existing data is retained."
            .into(),
    )
}
#[tauri::command]
pub async fn workspace_service_stop(app: tauri::AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "linux")]
    run("systemctl", &["--user", "stop", "base-workspace.service"])?;
    #[cfg(target_os = "macos")]
    run(
        "launchctl",
        &["bootout", &format!("{}/{LABEL}", user_domain()?)],
    )?;
    workspace_service_status(app).await
}
#[tauri::command]
pub async fn workspace_service_autostart(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    install(&app)?;
    #[cfg(target_os = "linux")]
    run(
        "systemctl",
        &[
            "--user",
            if enabled { "enable" } else { "disable" },
            "base-workspace.service",
        ],
    )?;
    #[cfg(target_os = "macos")]
    {
        let path = login_path()?;
        if enabled {
            std::fs::create_dir_all(path.parent().ok_or("Login path unavailable")?)
                .map_err(|e| e.to_string())?;
            let text = std::fs::read_to_string(unit_path(&app)?)
                .map_err(|e| e.to_string())?
                .replace(
                    "<key>RunAtLoad</key><false/>",
                    "<key>RunAtLoad</key><true/>",
                );
            std::fs::write(path, text).map_err(|e| e.to_string())?;
        } else if path.exists() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    let db = app.state::<Database>();
    db.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO metadata VALUES('workspace_service_autostart',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled{"true"}else{"false"}]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn workspace_service_status(app: tauri::AppHandle) -> Result<Value, String> {
    fn usage(path: &Path) -> u64 {
        std::fs::read_dir(path)
            .map(|entries| {
                entries
                    .flatten()
                    .filter_map(|entry| {
                        let metadata = entry.metadata().ok()?;
                        Some(if metadata.is_dir() {
                            usage(&entry.path())
                        } else {
                            metadata.len()
                        })
                    })
                    .sum()
            })
            .unwrap_or(0)
    }
    let dir = directory(&app)?;
    let usage = usage(&dir);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let health = match client.get("http://127.0.0.1:53318/health").send().await {
        Ok(response) if response.status().is_success() => response.json::<Value>().await.ok(),
        _ => None,
    };
    let expected = if initialized(&app)? {
        let db = rusqlite::Connection::open_with_flags(
            dir.join("workspace.sqlite3"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT value FROM metadata WHERE key='workspace'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
    } else {
        None
    };
    let running = health.as_ref().is_some_and(|v| {
        v["product"] == "Base Workspace" && v["workspaceId"].as_str() == expected.as_deref()
    });
    let db = app.state::<Database>();
    let autostart =
        db.0.lock()
            .map_err(|e| e.to_string())?
            .query_row(
                "SELECT value FROM metadata WHERE key='workspace_service_autostart'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .as_deref()
            == Some("true");
    Ok(
        json!({"running":running,"endpoint":"http://127.0.0.1:53318","storageBytes":usage,"autostart":autostart,"initialized":expected.is_some(),"healthy":running}),
    )
}
pub fn hosted_password(app: &tauri::AppHandle) -> Result<String, String> {
    password_entry(app)?
        .get_password()
        .map_err(|_| "Local workspace credential is unavailable in the OS store".into())
}
