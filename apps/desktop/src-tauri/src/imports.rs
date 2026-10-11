use crate::database::{Database, Workspace};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri_plugin_dialog::DialogExt;

const ARRAYS: &[&str] = &[
    "tasks",
    "calendarEvents",
    "focusSessions",
    "incomeEntries",
    "subscriptions",
    "habits",
    "habitLogs",
    "projects",
    "projectNotes",
    "projectLinks",
    "wallets",
    "portfolioSnapshots",
    "milestones",
    "projectDocuments",
    "projectFiles",
    "exams",
    "schoolNotes",
    "playerSkills",
    "goals",
    "workouts",
    "socialStats",
    "businessKPIs",
    "briefs",
    "boards",
    "boardItems",
    "boardDrawings",
    "wikiPages",
    "wikiFolders",
    "courses",
    "shoppingList",
    "bookmarks",
    "readingList",
    "watchList",
];
pub fn imported_document(source: &Value) -> Result<Value, String> {
    let document = source
        .get("unsaved")
        .and_then(|v| v.get("document"))
        .or_else(|| source.get("workspace").and_then(|v| v.get("document")))
        .or_else(|| source.get("saved").and_then(|v| v.get("document")))
        .or_else(|| source.get("document"))
        .or_else(|| source.get("data"))
        .unwrap_or(source);
    if !document.is_object() || !ARRAYS.iter().any(|key| document.get(key).is_some()) {
        return Err(
            "Choose a Base document, desktop/browser export or legacy Swift snapshot.".into(),
        );
    }
    for key in ARRAYS {
        if document.get(key).is_some_and(|value| !value.is_array()) {
            return Err(format!(
                "Invalid {key} collection. The original file was not modified."
            ));
        }
    }
    if let Some(tasks) = document.get("tasks").and_then(Value::as_array) {
        for task in tasks {
            if !["id", "title", "createdAt"]
                .iter()
                .all(|key| task.get(key).is_some_and(Value::is_string))
                || !task.get("done").is_some_and(Value::is_boolean)
                || !matches!(
                    task.get("priority").and_then(Value::as_str),
                    Some("P1" | "P2" | "P3")
                )
            {
                return Err("A task is missing its required identity, title, creation timestamp, completion or priority fields. The original backup is unchanged; repair a copy before importing.".into());
            }
        }
    }
    Ok(document.clone())
}
#[tauri::command]
pub async fn import_workspace(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
) -> Result<Option<Workspace>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Base JSON snapshot", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 128 * 1024 * 1024 {
        return Err(
            "This backup exceeds the 128 MB import limit. The original file is unchanged.".into(),
        );
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let source: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Invalid JSON. The original file was not changed.")?;
    let document = imported_document(&source)?;
    let scope = format!("import-{:x}", Sha256::digest(&bytes));
    let label = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Imported workspace");
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    transaction.execute("INSERT OR IGNORE INTO workspaces(scope,origin,workspace_id,document,baseline) VALUES(?1,'','',?2,?2)", params![scope, document.to_string()]).map_err(|e| e.to_string())?;
    for (key, value) in [
        (format!("import:{scope}:source"), source.to_string()),
        (format!("label:{scope}"), label.to_owned()),
        ("last_offline_scope".into(), scope.clone()),
        ("active_scope".into(), scope.clone()),
    ] {
        transaction.execute("INSERT INTO metadata(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(Some(Database::load(&connection, &scope)?))
}
pub fn last_offline_scope(connection: &rusqlite::Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT value FROM metadata WHERE key='last_offline_scope'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map(|scope| scope.unwrap_or_else(|| "local".into()))
        .map_err(|e| e.to_string())
}
#[derive(Serialize)]
pub struct OfflineWorkspace {
    scope: String,
    label: String,
}
#[tauri::command]
pub async fn list_offline_workspaces(
    db: tauri::State<'_, Database>,
) -> Result<Vec<OfflineWorkspace>, String> {
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    let mut statement = connection.prepare("SELECT scope,coalesce((SELECT value FROM metadata WHERE key='label:'||scope),'Local workspace') FROM workspaces WHERE origin='' ORDER BY scope").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |r| {
            Ok(OfflineWorkspace {
                scope: r.get(0)?,
                label: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
#[tauri::command]
pub async fn activate_offline_workspace(
    db: tauri::State<'_, Database>,
    scope: String,
) -> Result<Workspace, String> {
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let saved = Database::load(&connection, &scope)?;
    if !saved.origin.is_empty() {
        return Err("Select an offline workspace. Cloud workspaces require authentication.".into());
    }
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    for key in ["active_scope", "last_offline_scope"] {
        transaction.execute("INSERT INTO metadata(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, scope]).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(saved)
}
#[tauri::command]
pub async fn read_offline_source(db: tauri::State<'_, Database>) -> Result<Value, String> {
    let connection = db.0.lock().map_err(|e| e.to_string())?;
    let scope = last_offline_scope(&connection)?;
    let workspace = Database::load(&connection, &scope)?;
    if !workspace.origin.is_empty() {
        return Err("The selected source is not an offline workspace.".into());
    }
    let raw: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key=?1",
            [format!("import:{scope}:source")],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let source = raw
        .map(|s| serde_json::from_str::<Value>(&s))
        .transpose()
        .map_err(|e| e.to_string())?;
    Ok(json!({ "workspace": workspace, "source": source }))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_preserve_native_fields_and_choose_unsaved_exports() {
        let source = json!({ "document": { "tasks": [{ "id": "kept", "title":"Kept", "createdAt":"2026-10-11", "done":false, "priority":"P2", "nativeExtension": true }], "future": { "kept": true } }, "pending": [{ "action": "delete", "recordId": "old" }] });
        assert_eq!(imported_document(&source).unwrap()["future"]["kept"], true);
        assert_eq!(source["pending"][0]["recordId"], "old");
        let export = json!({ "saved": { "document": { "tasks": [] } }, "unsaved": { "document": { "tasks": [{ "id": "unsaved", "title":"Unsaved", "createdAt":"2026-10-11", "done":false, "priority":"P2" }] } } });
        assert_eq!(
            imported_document(&export).unwrap()["tasks"][0]["id"],
            "unsaved"
        );
    }
    #[test]
    fn invalid_imports_fail_without_normalizing_away_bad_data() {
        assert!(imported_document(&json!({ "tasks": "not an array" })).is_err());
        assert!(imported_document(&json!({ "token": "not a workspace" })).is_err());
        assert!(imported_document(
            &json!({ "tasks": [{"id":"broken","title":"Missing timestamp"}] })
        )
        .is_err());
    }
}
