use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::Path, sync::Mutex};

pub struct Database(pub Mutex<Connection>);
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub scope: String,
    pub origin: String,
    pub workspace_id: String,
    pub document: Value,
    pub baseline: Value,
    pub revision: i64,
    pub local_revision: i64,
    pub pending: Vec<Value>,
    pub conflicts: Vec<Value>,
}
impl Database {
    pub fn open(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let mut connection = Connection::open(path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        migrate(&mut connection)?;
        Ok(Self(Mutex::new(connection)))
    }
    pub fn active_scope(connection: &Connection) -> Result<String, String> {
        connection
            .query_row(
                "SELECT value FROM metadata WHERE key='active_scope'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map(|v| v.unwrap_or_else(|| "local".into()))
            .map_err(|e| e.to_string())
    }
    pub fn load(connection: &Connection, scope: &str) -> Result<Workspace, String> {
        let mut workspace = connection.query_row(
            "SELECT origin, workspace_id, document, baseline, revision, local_revision FROM workspaces WHERE scope=?1", [scope], |r| {
                Ok(Workspace { scope: scope.into(), origin: r.get(0)?, workspace_id: r.get(1)?,
                    document: decode(r.get(2)?)?, baseline: decode(r.get(3)?)?, revision: r.get(4)?, local_revision: r.get(5)?, pending: vec![], conflicts: vec![] })
            }).map_err(|e| e.to_string())?;
        workspace.pending = read_values(
            connection,
            "SELECT payload FROM outbox WHERE scope=?1 ORDER BY sequence",
            scope,
        )?;
        workspace.conflicts = read_values(
            connection,
            "SELECT payload FROM conflicts WHERE scope=?1 AND resolved=0 ORDER BY rowid",
            scope,
        )?;
        Ok(workspace)
    }
    pub fn activate(
        connection: &mut Connection,
        scope: &str,
        origin: &str,
        workspace: &str,
        defaults: &Value,
    ) -> Result<Workspace, String> {
        let transaction = connection.transaction().map_err(|e| e.to_string())?;
        transaction.execute("INSERT OR IGNORE INTO workspaces(scope, origin, workspace_id, document, baseline) VALUES (?1,?2,?3,?4,'{}')",
            params![scope, origin, workspace, defaults.to_string()]).map_err(|e| e.to_string())?;
        transaction.execute("INSERT INTO metadata(key,value) VALUES('active_scope',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [scope]).map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
        Self::load(connection, scope)
    }
}
fn decode(value: String) -> rusqlite::Result<Value> {
    serde_json::from_str(&value).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            value.len(),
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    })
}
fn read_values(connection: &Connection, sql: &str, scope: &str) -> Result<Vec<Value>, String> {
    let mut statement = connection.prepare(sql).map_err(|e| e.to_string())?;
    let values = statement
        .query_map([scope], |r| decode(r.get(0)?))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    values
}
fn migrate(connection: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        return Err("Local database was created by a newer Base version. Upgrade Base; data was not changed.".into());
    }
    if version == 0 {
        let transaction = connection.transaction()?;
        transaction.execute_batch("
            CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE workspaces(scope TEXT PRIMARY KEY,origin TEXT NOT NULL,workspace_id TEXT NOT NULL,document TEXT NOT NULL CHECK(json_valid(document)),baseline TEXT NOT NULL CHECK(json_valid(baseline)),revision INTEGER NOT NULL DEFAULT 0,local_revision INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),created_at INTEGER NOT NULL DEFAULT(unixepoch()));
            CREATE INDEX outbox_scope ON outbox(scope,sequence);
            CREATE TABLE conflicts(scope TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),resolved INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(scope,id));
            CREATE TABLE response_cache(scope TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,bytes INTEGER NOT NULL,touched INTEGER NOT NULL DEFAULT(unixepoch()),PRIMARY KEY(scope,key));
            PRAGMA user_version=1;
        ")?;
        transaction.commit()?;
    }
    Ok(())
}
fn validate_document(value: &Value) -> Result<(), String> {
    if !value.is_object() || value.to_string().len() > 128 * 1024 * 1024 {
        return Err("Invalid or oversized workspace; no data was changed.".into());
    }
    Ok(())
}
fn ensure_current(connection: &Connection, scope: &str, revision: i64) -> Result<(), String> {
    if Database::active_scope(connection)? != scope {
        return Err("Workspace changed; reload before editing.".into());
    }
    let current: i64 = connection
        .query_row(
            "SELECT local_revision FROM workspaces WHERE scope=?1",
            [scope],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if current != revision {
        return Err("Local revision changed; reload before editing.".into());
    }
    Ok(())
}
fn enqueue(connection: &Connection, scope: &str, operations: &[Value]) -> Result<(), String> {
    let count: i64 = connection
        .query_row("SELECT count(*) FROM outbox WHERE scope=?1", [scope], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    if count + operations.len() as i64 > 100_000 {
        return Err(
            "Pending changes reached the safety limit. Sync or export before editing.".into(),
        );
    }
    for operation in operations {
        let id = operation
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 100)
            .ok_or("Invalid operation ID")?;
        if operation.get("path").and_then(Value::as_array).is_none() {
            return Err("Invalid operation path".into());
        }
        connection
            .execute(
                "INSERT INTO outbox(scope,id,payload) VALUES(?1,?2,?3)",
                params![scope, id, operation.to_string()],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_workspace(
    db: tauri::State<'_, Database>,
    defaults: Value,
) -> Result<Workspace, String> {
    validate_document(&defaults)?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let scope = Database::active_scope(&connection)?;
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE scope=?1)",
            [&scope],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists {
        Database::load(&connection, &scope)
    } else {
        Database::activate(&mut connection, "local", "", "", &defaults)
    }
}

#[tauri::command]
pub async fn commit_local(
    db: tauri::State<'_, Database>,
    scope: String,
    expected_revision: i64,
    document: Value,
    operations: Vec<Value>,
) -> Result<Workspace, String> {
    validate_document(&document)?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    ensure_current(&transaction, &scope, expected_revision)?;
    enqueue(&transaction, &scope, &operations)?;
    transaction
        .execute(
            "UPDATE workspaces SET document=?1,local_revision=local_revision+1 WHERE scope=?2",
            params![document.to_string(), scope],
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Database::load(&connection, &scope)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    workspace_id: String,
    revision: i64,
    data: Option<Value>,
    applied: Vec<String>,
    conflicts: Vec<Value>,
    recovery: Option<Recovery>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recovery {
    reason: String,
    previous_revision: i64,
}
#[tauri::command]
pub async fn apply_sync(
    db: tauri::State<'_, Database>,
    scope: String,
    expected_revision: i64,
    response: SyncResult,
    document: Value,
    recovery_conflicts: Option<Vec<Value>>,
) -> Result<Workspace, String> {
    validate_document(&document)?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    ensure_current(&transaction, &scope, expected_revision)?;
    let current = Database::load(&transaction, &scope)?;
    if response.recovery.is_some() {
        apply_recovery(
            &transaction,
            &current,
            &response,
            &document,
            &recovery_conflicts.unwrap_or_default(),
        )?;
        transaction.commit().map_err(|e| e.to_string())?;
        return Database::load(&connection, &scope);
    }
    if current.workspace_id != response.workspace_id || response.revision < current.revision {
        return Err("Sync workspace or revision mismatch; nothing was acknowledged.".into());
    }
    for id in &response.applied {
        transaction
            .execute(
                "DELETE FROM outbox WHERE scope=?1 AND id=?2",
                params![scope, id],
            )
            .map_err(|e| e.to_string())?;
    }
    for conflict in &response.conflicts {
        let id = conflict
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Invalid conflict ID")?;
        transaction.execute("INSERT INTO conflicts(scope,id,payload) VALUES(?1,?2,?3) ON CONFLICT(scope,id) DO NOTHING", params![scope, id, conflict.to_string()]).map_err(|e| e.to_string())?;
        transaction
            .execute(
                "DELETE FROM outbox WHERE scope=?1 AND id=?2",
                params![scope, id],
            )
            .map_err(|e| e.to_string())?;
    }
    let baseline = response.data.unwrap_or(current.baseline);
    transaction.execute("UPDATE workspaces SET document=?1,baseline=?2,revision=?3,local_revision=local_revision+1 WHERE scope=?4", params![document.to_string(), baseline.to_string(), response.revision, scope]).map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Database::load(&connection, &scope)
}

fn apply_recovery(
    connection: &Connection,
    current: &Workspace,
    response: &SyncResult,
    document: &Value,
    conflicts: &[Value],
) -> Result<(), String> {
    let recovery = response
        .recovery
        .as_ref()
        .ok_or("Missing recovery marker")?;
    if current.workspace_id != response.workspace_id
        || recovery.reason != "server-reset"
        || recovery.previous_revision != current.revision
        || response.revision < 0
        || response.revision >= current.revision
        || response.data.as_ref().is_none_or(|v| !v.is_object())
        || !response.applied.is_empty()
        || !response.conflicts.is_empty()
    {
        return Err("Invalid recovery; nothing was changed.".into());
    }
    // Archive the entire pre-reset state including acknowledged records, opaque
    // fields, queued deletions and existing conflicts, in the same transaction.
    let key = format!("recovery:{}:{}", current.scope, current.local_revision);
    connection
        .execute(
            "INSERT INTO metadata(key,value) VALUES(?1,?2)",
            params![
                key,
                serde_json::to_string(current).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    for conflict in conflicts {
        let id = conflict
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Invalid recovery conflict")?;
        if conflict.get("reason").and_then(Value::as_str) != Some("server-reset") {
            return Err("Invalid recovery conflict reason".into());
        }
        connection
            .execute(
                "INSERT INTO conflicts(scope,id,payload) VALUES(?1,?2,?3)",
                params![current.scope, id, conflict.to_string()],
            )
            .map_err(|e| e.to_string())?;
    }
    connection
        .execute("DELETE FROM outbox WHERE scope=?1", [&current.scope])
        .map_err(|e| e.to_string())?;
    connection.execute("UPDATE workspaces SET document=?1,baseline=?2,revision=?3,local_revision=local_revision+1 WHERE scope=?4", params![document.to_string(), response.data.as_ref().unwrap().to_string(), response.revision, current.scope]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn resolve_conflict(
    db: tauri::State<'_, Database>,
    scope: String,
    expected_revision: i64,
    id: String,
    document: Value,
    operations: Vec<Value>,
) -> Result<Workspace, String> {
    validate_document(&document)?;
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    ensure_current(&transaction, &scope, expected_revision)?;
    let changed = transaction
        .execute(
            "UPDATE conflicts SET resolved=1 WHERE scope=?1 AND id=?2 AND resolved=0",
            params![scope, id],
        )
        .map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("Conflict was already resolved.".into());
    }
    enqueue(&transaction, &scope, &operations)?;
    transaction
        .execute(
            "UPDATE workspaces SET document=?1,local_revision=local_revision+1 WHERE scope=?2",
            params![document.to_string(), scope],
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Database::load(&connection, &scope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn migrations_are_idempotent_and_preserve_unknown_data() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let snapshot = json!({"tasks":[],"future":{"retained":true}});
        Database::activate(&mut connection, "local", "", "", &snapshot).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(
            Database::load(&connection, "local").unwrap().document,
            snapshot
        );
    }
    #[test]
    fn newer_database_fails_closed() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "user_version", 99).unwrap();
        assert!(migrate(&mut connection).is_err());
        assert_eq!(
            connection
                .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
                .unwrap(),
            99
        );
    }
    #[test]
    fn failed_outbox_write_rolls_back_document() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        Database::activate(&mut connection, "local", "", "", &json!({"tasks":[]})).unwrap();
        {
            let transaction = connection.transaction().unwrap();
            transaction
                .execute(
                    "UPDATE workspaces SET document='{}' WHERE scope='local'",
                    [],
                )
                .unwrap();
            assert!(enqueue(
                &transaction,
                "local",
                &[
                    json!({"id":"a","path":["tasks"]}),
                    json!({"id":"a","path":["tasks"]})
                ]
            )
            .is_err());
        }
        let workspace = Database::load(&connection, "local").unwrap();
        assert_eq!(workspace.document, json!({"tasks":[]}));
        assert!(workspace.pending.is_empty());
    }
    #[test]
    fn recovery_archives_the_full_outbox_and_keeps_reviewable_conflicts_atomically() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let original = serde_json::json!({"tasks":[{"id":"offline","title":"Retain me"}],"future":{"keep":true}});
        Database::activate(
            &mut connection,
            "cloud",
            "https://fixture.test",
            "w",
            &original,
        )
        .unwrap();
        connection
            .execute(
                "UPDATE workspaces SET revision=9,baseline=?1 WHERE scope='cloud'",
                [original.to_string()],
            )
            .unwrap();
        enqueue(
            &connection,
            "cloud",
            &[serde_json::json!({"id":"queued","path":["tasks"],"after":{"exists":false}})],
        )
        .unwrap();
        let current = Database::load(&connection, "cloud").unwrap();
        let response:SyncResult=serde_json::from_value(serde_json::json!({"workspaceId":"w","revision":0,"data":{"tasks":[]},"applied":[],"conflicts":[],"recovery":{"reason":"server-reset","previousRevision":9}})).unwrap();
        let conflict = serde_json::json!({"id":"review","reason":"server-reset","operation":{"after":{"exists":true,"value":"Retain me"}}});
        {
            let transaction = connection.transaction().unwrap();
            apply_recovery(
                &transaction,
                &current,
                &response,
                &original,
                std::slice::from_ref(&conflict),
            )
            .unwrap();
            transaction.commit().unwrap();
        }
        let saved = Database::load(&connection, "cloud").unwrap();
        assert_eq!(saved.revision, 0);
        assert_eq!(saved.document, original);
        assert!(saved.pending.is_empty());
        assert_eq!(saved.conflicts, vec![conflict]);
        let archive: String = connection
            .query_row(
                "SELECT value FROM metadata WHERE key='recovery:cloud:0'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let archived: Workspace = serde_json::from_str(&archive).unwrap();
        assert_eq!(archived.pending, current.pending);
        assert_eq!(archived.baseline, current.baseline);
        assert_eq!(archived.document, original);
    }
    #[test]
    fn invalid_recovery_rolls_back_archive_and_preserves_pending_edits() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        Database::activate(
            &mut connection,
            "cloud",
            "https://fixture.test",
            "w",
            &serde_json::json!({"tasks":[]}),
        )
        .unwrap();
        connection
            .execute("UPDATE workspaces SET revision=9 WHERE scope='cloud'", [])
            .unwrap();
        enqueue(
            &connection,
            "cloud",
            &[serde_json::json!({"id":"queued","path":["tasks"]})],
        )
        .unwrap();
        let current = Database::load(&connection, "cloud").unwrap();
        let response:SyncResult=serde_json::from_value(serde_json::json!({"workspaceId":"w","revision":0,"data":{},"applied":[],"conflicts":[],"recovery":{"reason":"server-reset","previousRevision":9}})).unwrap();
        {
            let transaction = connection.transaction().unwrap();
            assert!(apply_recovery(
                &transaction,
                &current,
                &response,
                &serde_json::json!({}),
                &[serde_json::json!({"reason":"server-reset"})]
            )
            .is_err());
        }
        assert_eq!(
            Database::load(&connection, "cloud").unwrap().pending,
            current.pending
        );
        let archives: i64 = connection
            .query_row(
                "SELECT count(*) FROM metadata WHERE key LIKE 'recovery:%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(archives, 0);
    }
    #[test]
    fn workspace_isolation_and_stale_revision_guard() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        Database::activate(
            &mut connection,
            "one",
            "https://one.test",
            "w1",
            &json!({"tasks":[{"id":"private"}]}),
        )
        .unwrap();
        Database::activate(
            &mut connection,
            "two",
            "https://two.test",
            "w2",
            &json!({"tasks":[]}),
        )
        .unwrap();
        assert!(ensure_current(&connection, "one", 0).is_err());
        assert!(ensure_current(&connection, "two", 1).is_err());
        assert_eq!(
            Database::load(&connection, "one").unwrap().document["tasks"][0]["id"],
            "private"
        );
    }
}
