-- Track immutable recovery objects before writing them. Unreferenced objects
-- left by failed/CAS-retried requests can be reclaimed without losing a backup.
CREATE TABLE recovery_objects(workspace_id TEXT NOT NULL,key TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(workspace_id,key));
CREATE INDEX recovery_objects_created ON recovery_objects(created_at);
