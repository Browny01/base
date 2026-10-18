-- Cleanup looks up immutable object keys, not backup/archive IDs. Without these
-- indexes, retaining N backups causes roughly N squared reads every hour.
CREATE INDEX backups_recovery_key ON backups(workspace_id,key);
CREATE INDEX migration_archives_recovery_key ON migration_archives(workspace_id,key);
CREATE INDEX jobs_pending_recovery_key ON jobs(workspace_id,CAST('recovery/'||workspace_id||'/'||id||'.json' AS TEXT)) WHERE status!='done';
