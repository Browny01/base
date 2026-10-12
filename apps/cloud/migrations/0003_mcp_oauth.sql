-- External MCP integrations are account-bound grants, not desktop device slots.
-- Secrets are hashed. Consumed refresh hashes survive until grant expiry so
-- replay revokes the whole grant instead of issuing a second token family.
CREATE TABLE oauth_clients(id TEXT PRIMARY KEY,redirect_uris TEXT NOT NULL,name TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE oauth_flows(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES oauth_clients(id),redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,resource TEXT NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE oauth_codes(hash TEXT PRIMARY KEY,flow_id TEXT NOT NULL UNIQUE REFERENCES oauth_flows(id),workspace_id TEXT NOT NULL REFERENCES workspaces(id),client_id TEXT NOT NULL REFERENCES oauth_clients(id),redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,resource TEXT NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE oauth_grants(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),client_id TEXT NOT NULL REFERENCES oauth_clients(id),created_at INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX oauth_grants_workspace ON oauth_grants(workspace_id);
CREATE TABLE oauth_tokens(hash TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES oauth_grants(id),kind TEXT NOT NULL CHECK(kind IN ('access','refresh')),expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
