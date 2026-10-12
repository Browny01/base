use crate::database::Database;
use base64::{engine::general_purpose::STANDARD, Engine};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

const ITERATIONS: u32 = 210_000;
#[derive(Serialize, Deserialize)]
struct Verifier {
    salt: String,
    key: String,
}
fn entry(scope: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.base.personal.desktop.notes", scope)
        .map_err(|_| "The OS credential store is unavailable.".into())
}
fn encode(password: &str) -> Result<String, String> {
    let salt = uuid::Uuid::new_v4();
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), ITERATIONS, &mut key);
    serde_json::to_string(&Verifier {
        salt: STANDARD.encode(salt.as_bytes()),
        key: STANDARD.encode(key),
    })
    .map_err(|e| e.to_string())
}
fn matches(password: &str, raw: &str) -> bool {
    let Ok(verifier) = serde_json::from_str::<Verifier>(raw) else {
        return false;
    };
    let (Ok(salt), Ok(expected)) = (
        STANDARD.decode(verifier.salt),
        STANDARD.decode(verifier.key),
    ) else {
        return false;
    };
    if salt.len() != 16 || expected.len() != 32 {
        return false;
    }
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, ITERATIONS, &mut key);
    key.iter()
        .zip(expected)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}
fn shared_matches(password: &str, value: &serde_json::Value) -> bool {
    if value.get("version").and_then(|v| v.as_u64()) != Some(1)
        || value.get("iterations").and_then(|v| v.as_u64()) != Some(210_000)
    {
        return false;
    }
    let (Some(salt), Some(hash)) = (
        value.get("salt").and_then(|v| v.as_str()),
        value.get("hash").and_then(|v| v.as_str()),
    ) else {
        return false;
    };
    matches(
        password,
        &serde_json::json!({"salt":salt,"key":hash}).to_string(),
    )
}
pub fn remember(scope: &str, password: &str) -> Result<(), String> {
    if password.is_empty() || password.len() > 4096 {
        return Err("Invalid note password.".into());
    }
    entry(scope)?.set_password(&encode(password)?).map_err(|_| {
        "Could not save the offline note verifier. Unlock the OS credential store.".into()
    })
}
fn active(db: &Database, scope: &str) -> Result<crate::database::Workspace, String> {
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    if Database::active_scope(&connection)? != scope {
        return Err("Workspace changed.".into());
    }
    Database::load(&connection, scope)
}
#[tauri::command]
pub async fn verify_note_password(
    db: tauri::State<'_, Database>,
    scope: String,
    password: String,
) -> Result<bool, String> {
    let workspace = active(&db, &scope)?;
    if password.is_empty() || password.len() > 4096 {
        return Ok(false);
    }
    if let Some(value) = workspace
        .document
        .get("profile")
        .and_then(|v| v.get("notePassword"))
        .cloned()
    {
        return tauri::async_runtime::spawn_blocking(move || shared_matches(&password, &value))
            .await
            .map_err(|e| e.to_string());
    }
    let raw = entry(&scope)?.get_password().map_err(|_| "Connect or renew your account session to enable offline note unlocking. For a local workspace, set a note password in Account & sync.".to_owned())?;
    tauri::async_runtime::spawn_blocking(move || matches(&password, &raw))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn set_local_note_password(
    db: tauri::State<'_, Database>,
    scope: String,
    password: String,
) -> Result<(), String> {
    let workspace = active(&db, &scope)?;
    let cloud =
        db.0.lock()
            .map_err(|e| e.to_string())?
            .query_row(
                "SELECT value FROM metadata WHERE key=?1",
                [format!("workspace_kind:{scope}")],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .as_deref()
            == Some("cloud");
    if !workspace.origin.is_empty() && !cloud && workspace.origin != "http://127.0.0.1:53318" {
        return Err("Account notes use the Base account password.".into());
    }
    tauri::async_runtime::spawn_blocking(move || remember(&scope, &password))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_verifier_matches_web_crypto_and_rejects_unknown_costs() {
        let mut value = serde_json::json!({"version":1,"iterations":210000,"salt":"AQIDBAUGBwgJCgsMDQ4PEA==","hash":"l3J601xuSfJ5SvIiE9rovasOuR4sFiV1iD3E7SjqudI="});
        assert!(shared_matches("workspace-fixture-password", &value));
        assert!(!shared_matches("wrong-password", &value));
        value["iterations"] = serde_json::json!(1_000_000_000);
        assert!(!shared_matches("workspace-fixture-password", &value));
    }
    #[test]
    fn salted_verifiers_reject_wrong_and_malformed_passwords() {
        let first = encode("local-test-password").unwrap();
        assert!(matches("local-test-password", &first));
        assert!(!matches("wrong-password", &first));
        assert!(!matches("local-test-password", "{}"));
        assert_ne!(first, encode("local-test-password").unwrap());
        assert!(!first.contains("local-test-password"));
    }
}
