UPDATE workspaces SET document_bytes=(SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM documents WHERE workspace_id=workspaces.id);
CREATE TABLE document_versions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),node TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(workspace_id,node));
CREATE INDEX document_versions_cursor ON document_versions(workspace_id,revision,node);
INSERT INTO document_versions SELECT d.workspace_id,d.node,w.revision,0 FROM documents d JOIN workspaces w ON w.id=d.workspace_id GROUP BY d.workspace_id,d.node;
CREATE TABLE node_history(workspace_id TEXT NOT NULL,node TEXT NOT NULL,revision INTEGER NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(workspace_id,node,revision,part));
CREATE INDEX node_history_expiry ON node_history(created_at);
CREATE TRIGGER documents_version_insert AFTER INSERT ON documents BEGIN
 INSERT INTO document_versions VALUES(NEW.workspace_id,NEW.node,(SELECT revision+1 FROM workspaces WHERE id=NEW.workspace_id),0) ON CONFLICT(workspace_id,node) DO UPDATE SET revision=excluded.revision,deleted=0;
END;
CREATE TRIGGER documents_version_delete BEFORE DELETE ON documents BEGIN
 INSERT OR IGNORE INTO node_history VALUES(OLD.workspace_id,OLD.node,(SELECT revision FROM workspaces WHERE id=OLD.workspace_id),OLD.part,OLD.body,unixepoch());
 INSERT INTO document_versions VALUES(OLD.workspace_id,OLD.node,(SELECT revision+1 FROM workspaces WHERE id=OLD.workspace_id),1) ON CONFLICT(workspace_id,node) DO UPDATE SET revision=excluded.revision,deleted=1;
END;
