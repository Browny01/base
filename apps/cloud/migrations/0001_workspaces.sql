PRAGMA foreign_keys=ON;
CREATE TABLE accounts(id TEXT PRIMARY KEY,display_name TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',profile_version INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE TABLE workspaces(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),revision INTEGER NOT NULL DEFAULT 0,document_bytes INTEGER NOT NULL DEFAULT 0,file_bytes INTEGER NOT NULL DEFAULT 0,reserved_bytes INTEGER NOT NULL DEFAULT 0,plan TEXT NOT NULL DEFAULT 'free',customer_id TEXT UNIQUE,subscription_id TEXT UNIQUE,subscription_status TEXT NOT NULL DEFAULT 'none',paid_until INTEGER NOT NULL DEFAULT 0,billing_version INTEGER NOT NULL DEFAULT 0,next_backup_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE documents(workspace_id TEXT NOT NULL REFERENCES workspaces(id),node TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,node,part));
CREATE TABLE devices(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,label TEXT NOT NULL DEFAULT 'Base device',enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(workspace_id,id));
CREATE TABLE sessions(hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,device_id TEXT NOT NULL,expires INTEGER NOT NULL,FOREIGN KEY(workspace_id,device_id) REFERENCES devices(workspace_id,id));
CREATE INDEX sessions_workspace ON sessions(workspace_id,device_id);
CREATE TABLE receipts(workspace_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(workspace_id,id));
CREATE TABLE receipt_chunks(workspace_id TEXT NOT NULL,id TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,id,part));
CREATE TABLE tombstones(workspace_id TEXT NOT NULL,path TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(workspace_id,path));
CREATE TABLE auth_flows(id TEXT PRIMARY KEY,challenge TEXT NOT NULL,device_id TEXT NOT NULL,expires INTEGER NOT NULL,account_id TEXT,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE files(workspace_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(workspace_id,id));
CREATE TABLE commit_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE jobs(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
CREATE INDEX jobs_pending ON jobs(status,created_at);
CREATE TABLE backups(workspace_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,key TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(workspace_id,id));
CREATE TABLE webhook_events(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE migration_archives(workspace_id TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,sha256 TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(workspace_id,id));
CREATE TABLE staged_parts(workspace_id TEXT NOT NULL,key TEXT NOT NULL,size INTEGER NOT NULL,expires INTEGER NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(workspace_id,key));

CREATE TABLE checkout_attempts(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),id TEXT NOT NULL,expires INTEGER NOT NULL);

CREATE TABLE job_leases(job_id TEXT PRIMARY KEY REFERENCES jobs(id),owner TEXT NOT NULL,expires INTEGER NOT NULL);

CREATE TABLE rate_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
