use crate::protocol::{self, Operation};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use pbkdf2::pbkdf2_hmac;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use subtle::ConstantTimeEq;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
pub fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn random() -> String {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}
pub struct Store {
    pub db: Connection,
    pub workspace: String,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        db.pragma_update(None, "synchronous", "FULL")
            .map_err(|e| e.to_string())?;
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 2 {
            return Err("A newer Base version created this workspace; nothing was changed.".into());
        }
        if version == 0 {
            db.execute_batch("BEGIN;CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS snapshot(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,document TEXT NOT NULL CHECK(json_valid(document)));CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,device TEXT NOT NULL,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,conflict TEXT);CREATE TABLE IF NOT EXISTS tombstones(path TEXT PRIMARY KEY,revision INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS chunks(upload TEXT,part INTEGER,bytes BLOB,expires INTEGER,PRIMARY KEY(upload,part));CREATE TABLE IF NOT EXISTS history(revision INTEGER PRIMARY KEY,document TEXT NOT NULL,created INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS login_failures(created INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,size INTEGER NOT NULL,mime TEXT NOT NULL);INSERT OR IGNORE INTO snapshot VALUES(1,0,'{}');PRAGMA user_version=1;COMMIT;").map_err(|e|e.to_string())?;
        }
        if version < 2 {
            db.execute_batch("BEGIN;ALTER TABLE files ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;PRAGMA user_version=2;COMMIT;").map_err(|e|e.to_string())?;
        }
        db.execute(
            "INSERT OR IGNORE INTO metadata VALUES('workspace',?1)",
            [random()],
        )
        .map_err(|e| e.to_string())?;
        let workspace = db
            .query_row(
                "SELECT value FROM metadata WHERE key='workspace'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(Self { db, workspace })
    }
    pub fn initialize(&mut self, password: &str) -> Result<(), String> {
        if password.len() < 16 || password.len() > 4096 {
            return Err("Use a password of at least 16 characters.".into());
        }
        let salt = random();
        let mut digest = [0u8; 32];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), 210_000, &mut digest);
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        if tx
            .query_row(
                "SELECT count(*) FROM metadata WHERE key='password'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0
        {
            return Err(
                "Workspace is already initialized; password and data were not replaced.".into(),
            );
        }
        tx.execute(
            "INSERT INTO metadata VALUES('password',?1)",
            [format!("{salt}:{}", STANDARD.encode(digest))],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn login(&mut self, password: &str, device: &str) -> Result<Value, String> {
        if password.len() > 4096 || device.is_empty() || device.len() > 200 {
            return Err("Invalid login.".into());
        }
        self.db
            .execute("DELETE FROM login_failures WHERE created<?1", [now() - 300])
            .map_err(|e| e.to_string())?;
        let failures: i64 = self
            .db
            .query_row("SELECT count(*) FROM login_failures", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if failures >= 20 {
            return Err("Too many login attempts. Try again in five minutes.".into());
        }
        let stored: String = self
            .db
            .query_row("SELECT value FROM metadata WHERE key='password'", [], |r| {
                r.get(0)
            })
            .map_err(|_| "Workspace is not initialized")?;
        let (salt, digest) = stored.split_once(':').ok_or("Invalid password verifier")?;
        let mut actual = [0u8; 32];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), 210_000, &mut actual);
        let expected = STANDARD.decode(digest).map_err(|_| "Invalid verifier")?;
        if !bool::from(actual.as_slice().ct_eq(&expected)) {
            self.db
                .execute("INSERT INTO login_failures VALUES(?1)", [now()])
                .map_err(|e| e.to_string())?;
            return Err("Incorrect password.".into());
        }
        let token = format!("base_desktop_{}", random());
        let expires = now() + 30 * 86400;
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM sessions WHERE device=?1 OR expires<?2",
            params![device, now()],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO sessions VALUES(?1,?2,?3)",
            params![hash(&token), device, expires],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(
            json!({"ok":true,"token":token,"workspaceId":self.workspace,"deviceId":device,"expiresAt":expires*1000}),
        )
    }
    pub fn authenticate(&self, token: &str) -> Result<String, String> {
        if !token.starts_with("base_desktop_") || token.len() > 128 {
            return Err("Unauthorized".into());
        }
        self.db
            .query_row(
                "SELECT device FROM sessions WHERE hash=?1 AND expires>?2",
                params![hash(token), now()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("Unauthorized".into())
    }
    pub fn snapshot(&self) -> Result<(i64, Value), String> {
        let (r, raw): (i64, String) = self
            .db
            .query_row(
                "SELECT revision,document FROM snapshot WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        Ok((r, serde_json::from_str(&raw).map_err(|e| e.to_string())?))
    }
    pub fn stage(&self, body: &Value) -> Result<(), String> {
        if body["workspaceId"] != self.workspace {
            return Err("Workspace mismatch".into());
        }
        let upload = body["uploadId"]
            .as_str()
            .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or("Invalid upload")?;
        let part = body["index"].as_i64().ok_or("Invalid part")?;
        let parts = body["parts"]
            .as_i64()
            .filter(|n| *n > 0 && *n <= 43)
            .ok_or("Invalid parts")?;
        let bytes = STANDARD
            .decode(body["chunk"].as_str().ok_or("Invalid chunk")?)
            .map_err(|_| "Invalid chunk")?;
        if part < 0 || part >= parts || bytes.len() > 750_000 {
            return Err("Chunk too large".into());
        }
        self.db
            .execute("DELETE FROM chunks WHERE expires<?1", [now()])
            .map_err(|e| e.to_string())?;
        let used: i64 = self
            .db
            .query_row(
                "SELECT coalesce(sum(length(bytes)),0) FROM chunks",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if used > 64_000_000 {
            return Err("Staging is full. Original edit remains in the client outbox.".into());
        }
        self.db.execute("INSERT INTO chunks VALUES(?1,?2,?3,?4) ON CONFLICT(upload,part) DO UPDATE SET bytes=excluded.bytes,expires=excluded.expires",params![upload,part,bytes,now()+7*86400]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn sync(&mut self, body: &Value) -> Result<Value, String> {
        if body["protocol"] != 2 || body["workspaceId"] != self.workspace {
            return Err("Workspace or protocol mismatch".into());
        }
        let cursor = body["cursor"]
            .as_i64()
            .filter(|n| *n >= 0)
            .ok_or("Invalid cursor")?;
        let inputs = body["operations"]
            .as_array()
            .filter(|a| a.len() <= 200)
            .ok_or("Invalid operations")?;
        let mut operations = Vec::new();
        for value in inputs {
            let resolved = if value.get("uploadId").is_some() {
                let upload = value["uploadId"].as_str().ok_or("Invalid upload")?;
                let parts = value["parts"]
                    .as_u64()
                    .filter(|v| *v > 0 && *v <= 43)
                    .ok_or("Invalid parts")?;
                let mut bytes = Vec::new();
                for i in 0..parts {
                    let part: Vec<u8> = self
                        .db
                        .query_row(
                            "SELECT bytes FROM chunks WHERE upload=?1 AND part=?2 AND expires>?3",
                            params![upload, i as i64, now()],
                            |r| r.get(0),
                        )
                        .map_err(|_| "Upload expired; retry the original edit")?;
                    bytes.extend(part);
                    if bytes.len() > 32_000_000 {
                        return Err("Operation exceeds staging limit".into());
                    }
                }
                if format!("{:x}", Sha256::digest(&bytes)) != upload {
                    return Err("Upload checksum mismatch".into());
                }
                let v: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid upload JSON")?;
                if v["id"] != value["id"] {
                    return Err("Operation identity mismatch".into());
                }
                v
            } else {
                value.clone()
            };
            let op: Operation =
                serde_json::from_value(resolved).map_err(|_| "Invalid operation")?;
            if !protocol::validate(&op) {
                return Err("Invalid operation".into());
            }
            operations.push(op);
        }
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        let (revision, raw): (i64, String) = tx
            .query_row(
                "SELECT revision,document FROM snapshot WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let mut document: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if cursor > revision {
            return Ok(
                json!({"protocol":2,"workspaceId":self.workspace,"revision":revision,"data":document,"applied":[],"conflicts":[],"recovery":{"reason":"server-reset","previousRevision":cursor}}),
            );
        }
        let mut applied = Vec::new();
        let mut conflicts = Vec::new();
        let mut fresh = false;
        for op in operations {
            let fingerprint =
                hash(&serde_json::to_string(&serde_json::to_value(&op).unwrap()).unwrap());
            let receipt: Option<(String, Option<String>)> = tx
                .query_row(
                    "SELECT fingerprint,conflict FROM receipts WHERE id=?1",
                    [&op.id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some((original, conflict)) = receipt {
                if original != fingerprint {
                    return Err("Operation ID was reused with different content".into());
                }
                if let Some(c) = conflict {
                    conflicts.push(serde_json::from_str::<Value>(&c).map_err(|e| e.to_string())?)
                } else {
                    applied.push(op.id.clone())
                }
                continue;
            }
            if op.base_revision > revision {
                return Err("Operation revision is ahead of server".into());
            }
            let mut tombstoned = false;
            for n in 1..=op.path.len() {
                let path = serde_json::to_string(&op.path[..n]).unwrap();
                let deleted: Option<i64> = tx
                    .query_row(
                        "SELECT revision FROM tombstones WHERE path=?1",
                        [path],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                tombstoned |= deleted.is_some_and(|r| r > op.base_revision);
            }
            let (next, conflict) = protocol::merge(&document, &op, revision, tombstoned);
            document = next;
            tx.execute(
                "INSERT INTO receipts VALUES(?1,?2,?3)",
                params![op.id, fingerprint, conflict.as_ref().map(Value::to_string)],
            )
            .map_err(|e| e.to_string())?;
            fresh = true;
            if let Some(c) = conflict {
                conflicts.push(c)
            } else {
                applied.push(op.id.clone());
                if !op.after.exists {
                    tx.execute("INSERT INTO tombstones VALUES(?1,?2) ON CONFLICT(path) DO UPDATE SET revision=excluded.revision",params![serde_json::to_string(&op.path).unwrap(),revision+1]).map_err(|e|e.to_string())?;
                }
            }
        }
        let next_revision = revision + i64::from(fresh);
        if fresh {
            if document
                != serde_json::from_str::<Value>(&raw).map_err(|_| "Invalid stored document")?
            {
                tx.execute(
                    "INSERT INTO history VALUES(?1,?2,?3)",
                    params![revision, raw, now()],
                )
                .map_err(|e| e.to_string())?;
                document["updatedAt"] = json!(now() * 1000);
                document["dataRevision"] =
                    json!(document["dataRevision"].as_i64().unwrap_or(0) + 1);
            }
            tx.execute(
                "UPDATE snapshot SET revision=?1,document=?2 WHERE id=1",
                params![next_revision, document.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        let mut response = json!({"protocol":2,"workspaceId":self.workspace,"revision":next_revision,"applied":applied,"conflicts":conflicts});
        if body["full"] == true || cursor != next_revision || !inputs.is_empty() {
            response["data"] = document;
        }
        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }
    fn create(id: &str, title: &str) -> Value {
        json!({"id":id,"baseRevision":0,"path":["tasks",{"id":"task"}],"action":"set","before":{"exists":false},"after":{"exists":true,"value":{"id":"task","title":title,"future":true}}})
    }
    fn request(s: &Store, ops: Value, cursor: i64) -> Value {
        json!({"protocol":2,"workspaceId":s.workspace,"cursor":cursor,"operations":ops})
    }
    #[test]
    fn retries_do_not_duplicate_and_id_reuse_rolls_back() {
        let mut s = store();
        let req = request(&s, json!([create("a", "one")]), 0);
        let first = s.sync(&req).unwrap();
        assert_eq!(first["revision"], 1);
        assert_eq!(s.sync(&req).unwrap()["revision"], 1);
        let bad = request(&s, json!([create("b", "other"), create("a", "changed")]), 1);
        assert!(s.sync(&bad).is_err());
        assert_eq!(s.snapshot().unwrap().0, 1);
        assert_eq!(
            s.snapshot().unwrap().1["tasks"].as_array().unwrap().len(),
            1
        );
    }
    #[test]
    fn wrong_workspace_and_invalid_edits_are_rejected() {
        let mut s = store();
        let mut req = request(&s, json!([create("a", "one")]), 0);
        req["workspaceId"] = json!("someone-else");
        assert!(s.sync(&req).is_err());
        assert_eq!(s.snapshot().unwrap().0, 0);
    }
    #[test]
    fn rollback_returns_snapshot_without_receipts() {
        let mut s = store();
        let req = request(&s, json!([create("a", "one")]), 5);
        let result = s.sync(&req).unwrap();
        assert_eq!(result["recovery"]["reason"], "server-reset");
        assert_eq!(
            s.db.query_row("SELECT count(*) FROM receipts", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn version_one_migration_preserves_records_files_and_credentials() {
        let path = std::env::temp_dir().join(format!(
            "base-workspace-migration-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        let mut original = Store::open(&path).unwrap();
        original.initialize("migration password retained").unwrap();
        let workspace = original.workspace.clone();
        original
            .db
            .execute(
                "UPDATE snapshot SET revision=7,document=?1",
                [
                    json!({"tasks":[{"id":"t","unknown":{"retained":true}}],"futureRoot":42})
                        .to_string(),
                ],
            )
            .unwrap();
        let verifier: String = original
            .db
            .query_row("SELECT value FROM metadata WHERE key='password'", [], |r| {
                r.get(0)
            })
            .unwrap();
        original.db.execute_batch("ALTER TABLE files DROP COLUMN deleted;INSERT INTO files VALUES('file','archive.pdf',9,'application/pdf');PRAGMA user_version=1;").unwrap();
        drop(original);
        let upgraded = Store::open(&path).unwrap();
        assert_eq!(upgraded.workspace, workspace);
        assert_eq!(upgraded.snapshot().unwrap().0, 7);
        assert_eq!(upgraded.snapshot().unwrap().1["futureRoot"], 42);
        assert_eq!(
            upgraded
                .db
                .query_row("SELECT deleted FROM files WHERE id='file'", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            upgraded
                .db
                .query_row("SELECT value FROM metadata WHERE key='password'", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            verifier
        );
        assert_eq!(
            upgraded
                .db
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        drop(upgraded);
        let reopened = Store::open(&path).unwrap();
        assert_eq!(
            reopened.snapshot().unwrap().1["tasks"][0]["unknown"]["retained"],
            true
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn passwords_are_hashed_sessions_can_be_revoked() {
        let mut s = store();
        s.initialize("a long local password").unwrap();
        assert!(s.initialize("replacement password").is_err());
        assert!(s.login("wrong", "device").is_err());
        let session = s.login("a long local password", "device").unwrap();
        let token = session["token"].as_str().unwrap();
        assert_eq!(s.authenticate(token).unwrap(), "device");
        let saved: String =
            s.db.query_row("SELECT value FROM metadata WHERE key='password'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(!saved.contains("a long local password"));
        s.db.execute("DELETE FROM sessions", []).unwrap();
        assert!(s.authenticate(token).is_err());
    }
}
