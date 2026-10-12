-- Secrets are encrypted with a Worker secret; never part of sync/export records.
CREATE TABLE integration_credentials (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,provider)
);
