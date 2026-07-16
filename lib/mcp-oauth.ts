// OAuth 2.0 authorization server for the MCP endpoint (MCP Authorization spec).
// Public clients + PKCE (S256). A single password gate (MCP_PASSWORD or MCP_TOKEN)
// stands in for user login — this is a single-user personal server.

import { createHash, randomBytes } from "crypto";
import { mcpRedis } from "@/lib/mcp-data";

export const CODE_TTL = 300;                    // authorization code: 5 min
export const ACCESS_TTL = 60 * 60 * 24 * 30;    // access token: 30 days
export const REFRESH_TTL = 60 * 60 * 24 * 180;  // refresh token / client reg: 180 days

const K = {
  client: (id: string) => `mcp:oauth:client:${id}`,
  code: (c: string) => `mcp:oauth:code:${c}`,
  token: (t: string) => `mcp:oauth:token:${t}`,
  refresh: (t: string) => `mcp:oauth:refresh:${t}`,
};

export const randId = (n = 32) => randomBytes(n).toString("base64url");
export const pkceS256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const oauthPassword = () => process.env.MCP_PASSWORD || process.env.MCP_TOKEN || "";
export const checkPassword = (pw: string) => { const p = oauthPassword(); return !!p && pw === p; };

async function put(key: string, value: unknown, ttl: number) {
  const r = mcpRedis(); if (!r) return;
  await r.set(key, JSON.stringify(value), { ex: ttl });
}
async function read<T>(key: string): Promise<T | null> {
  const r = mcpRedis(); if (!r) return null;
  const v = await r.get(key);
  if (v == null) return null;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export interface OAuthClient { redirect_uris: string[]; client_name?: string }
export interface CodeData { client_id: string; redirect_uri: string; code_challenge?: string; resource?: string }

export const saveClient = (id: string, data: OAuthClient) => put(K.client(id), data, REFRESH_TTL);
export const getClient = (id: string) => read<OAuthClient>(K.client(id));

export const saveCode = (code: string, data: CodeData) => put(K.code(code), data, CODE_TTL);
export async function takeCode(code: string): Promise<CodeData | null> {
  const r = mcpRedis(); if (!r) return null;
  const data = await read<CodeData>(K.code(code));
  if (data) await r.del(K.code(code)); // single use
  return data;
}

export const saveToken = (token: string) => put(K.token(token), { scope: "nexus" }, ACCESS_TTL);
export const validateAccessToken = async (token: string) => (await read(K.token(token))) != null;

export const saveRefresh = (token: string) => put(K.refresh(token), { scope: "nexus" }, REFRESH_TTL);
export const validateRefresh = async (token: string) => (await read(K.refresh(token))) != null;

export function resourceMetadata(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["nexus"] };
}
export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/token`,
    registration_endpoint: `${origin}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["nexus"],
  };
}

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
