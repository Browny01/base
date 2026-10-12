import { clerkIdentity, clerkPage, provision } from "./auth.ts";
import {
  HttpError,
  boundedText,
  now,
  random,
  sha,
  type Env,
  type Principal,
  type WorkspaceRow,
} from "./types.ts";

const ACCESS_TTL = 3600,
  GRANT_TTL = 180 * 86400;
const resource = (env: Env) => `${new URL(env.PUBLIC_URL).origin}/api/mcp`;
export class OAuthError extends HttpError {
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(status, message);
    this.code = code;
  }
}
function invalid(message: string): never {
  throw new OAuthError("invalid_request", message);
}
function text(input: Record<string, unknown>, name: string, max = 1024) {
  const value = input[name];
  if (typeof value !== "string" || !value || value.length > max)
    invalid(`Invalid ${name}`);
  return value;
}
function target(env: Env, input: Record<string, unknown>) {
  const value = text(input, "resource");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("Invalid resource");
  }
  if (url!.href !== resource(env))
    throw new OAuthError(
      "invalid_target",
      "Tokens are issued only for this Base MCP endpoint",
    );
  return resource(env);
}
function redirect(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    invalid("Invalid redirect URI");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("Invalid redirect URI");
  }
  if (
    url!.username ||
    url!.password ||
    url!.hash ||
    !(
      url!.protocol === "https:" ||
      (url!.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url!.hostname))
    )
  )
    invalid("Redirects require HTTPS or explicit loopback");
  return value;
}
export async function pkce(verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    invalid("Invalid PKCE verifier");
  const hash = await sha(verifier);
  return btoa(
    String.fromCharCode(
      ...hash.match(/../g)!.map((part) => parseInt(part, 16)),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function oauthMetadata(env: Env) {
  const origin = new URL(env.PUBLIC_URL).origin;
  return {
    issuer: origin,
    authorization_endpoint: origin + "/api/mcp/authorize",
    token_endpoint: origin + "/api/mcp/token",
    registration_endpoint: origin + "/api/mcp/register",
    revocation_endpoint: origin + "/api/mcp/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["base"],
  };
}
export function protectedMetadata(env: Env) {
  return {
    resource: resource(env),
    authorization_servers: [new URL(env.PUBLIC_URL).origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["base"],
  };
}
export async function registerMcpClient(
  env: Env,
  input: Record<string, unknown>,
) {
  if (
    !Array.isArray(input.redirect_uris) ||
    input.redirect_uris.length < 1 ||
    input.redirect_uris.length > 5
  )
    invalid("Register one to five redirect URIs");
  const redirects = input.redirect_uris.map(redirect);
  if (
    input.token_endpoint_auth_method !== undefined &&
    input.token_endpoint_auth_method !== "none"
  )
    invalid("Only public PKCE clients are supported");
  if (
    input.grant_types !== undefined &&
    (!Array.isArray(input.grant_types) ||
      input.grant_types.some(
        (value) => !["authorization_code", "refresh_token"].includes(value),
      ))
  )
    invalid("Unsupported grant type");
  if (
    input.response_types !== undefined &&
    (!Array.isArray(input.response_types) ||
      input.response_types.some((value) => value !== "code"))
  )
    invalid("Only authorization code responses are supported");
  const name =
      typeof input.client_name === "string" && input.client_name.trim()
        ? input.client_name.trim().slice(0, 160)
        : "MCP integration",
    id = random();
  await env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?,?)")
    .bind(id, JSON.stringify(redirects), name, now(), now() + GRANT_TTL)
    .run();
  return {
    client_id: id,
    client_id_issued_at: now(),
    client_name: name,
    redirect_uris: redirects,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}
async function client(env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM oauth_clients WHERE id=? AND expires>?",
  )
    .bind(id, now())
    .first<{ id: string; redirect_uris: string; name: string }>();
  if (!row)
    throw new OAuthError(
      "invalid_client",
      "Client registration expired or is unknown",
    );
  return row;
}
export async function beginMcpAuthorization(
  env: Env,
  input: Record<string, unknown>,
) {
  const id = text(input, "client_id", 64),
    registered = await client(env, id),
    uri = redirect(input.redirect_uri),
    audience = target(env, input);
  if (!JSON.parse(registered.redirect_uris).includes(uri))
    invalid("Redirect URI is not registered");
  if (
    input.response_type !== "code" ||
    input.code_challenge_method !== "S256" ||
    typeof input.code_challenge !== "string" ||
    !/^[-\w]{43}$/.test(input.code_challenge)
  )
    invalid("Authorization code with PKCE S256 is required");
  if (input.scope !== undefined && input.scope !== "base")
    throw new OAuthError("invalid_scope", "Only the base scope is supported");
  const state = input.state === undefined ? "" : text(input, "state", 1024),
    flow = random();
  await env.DB.prepare(
    "INSERT INTO oauth_flows(id,client_id,redirect_uri,challenge,resource,state,expires) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(flow, id, uri, input.code_challenge, audience, state, now() + 600)
    .run();
  return { id: flow, name: registered.name, redirectUri: uri };
}
export async function approveMcpAuthorization(
  env: Env,
  request: Request,
  input: Record<string, unknown>,
) {
  const account = await clerkIdentity(env, request),
    workspace = await provision(env, account);
  return approveMcpForWorkspace(env, workspace.id, text(input, "id", 64));
}
// Kept separate for deterministic SQL/JWT-independent tests. This is never an
// HTTP route: public approval always verifies Clerk before deriving ownership.
export async function approveMcpForWorkspace(
  env: Env,
  workspace: string,
  id: string,
) {
  const flow = await env.DB.prepare(
    "SELECT * FROM oauth_flows WHERE id=? AND consumed=0 AND expires>?",
  )
    .bind(id, now())
    .first<{
      client_id: string;
      redirect_uri: string;
      challenge: string;
      resource: string;
      state: string;
    }>();
  if (!flow)
    throw new OAuthError(
      "invalid_request",
      "Authorization expired or was already approved",
    );
  const code = random(),
    guard = random();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oauth_flows WHERE id=? AND consumed=0 AND expires>?) AND EXISTS(SELECT 1 FROM workspaces w JOIN accounts a ON a.id=w.owner_id WHERE w.id=? AND a.status='active') THEN 1 ELSE 0 END)",
      ).bind(guard, id, now(), workspace),
      env.DB.prepare("UPDATE oauth_flows SET consumed=1 WHERE id=?").bind(id),
      env.DB.prepare("INSERT INTO oauth_codes VALUES(?,?,?,?,?,?,?,?,0)").bind(
        await sha(code),
        id,
        workspace,
        flow.client_id,
        flow.redirect_uri,
        flow.challenge,
        flow.resource,
        now() + 300,
      ),
      env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
    ]);
  } catch {
    throw new OAuthError(
      "invalid_request",
      "Authorization expired or was already approved",
    );
  }
  const url = new URL(flow.redirect_uri);
  url.searchParams.set("code", code);
  if (flow.state) url.searchParams.set("state", flow.state);
  return { redirectUrl: url.href };
}
export async function mcpConsentPage(env: Env, input: Record<string, unknown>) {
  if (!env.CLERK_PUBLISHABLE_KEY)
    throw new HttpError(503, "Cloud sign-in is not configured");
  const flow = await beginMcpAuthorization(env, input);
  // Escape HTML script delimiters in arbitrary registered client names/URIs.
  const json = (value: unknown) =>
    JSON.stringify(value).replaceAll("<", "\\u003c");
  const code = `const clerk=window.Clerk;await clerk.load({publishableKey:${json(env.CLERK_PUBLISHABLE_KEY)}});const root=document.getElementById('clerk'),approve=document.getElementById('approve');const update=()=>{if(!clerk.user){clerk.mountSignIn(root);approve.hidden=true;return;}root.replaceChildren();const label=document.createElement('p');label.textContent='Allow '+${json(flow.name)}+' to read and edit your Base workspace as '+(clerk.user.primaryEmailAddress?.emailAddress||'your account')+'? Locked and trashed notes remain private.';root.append(label);const destination=document.createElement('p');destination.textContent='Return to: '+${json(flow.redirectUri)};root.append(destination);const change=document.createElement('button');change.textContent='Use another account';change.onclick=()=>clerk.signOut();root.append(change);approve.hidden=false;};clerk.addListener(update);update();approve.onclick=async()=>{approve.disabled=true;try{const token=await clerk.session.getToken();const result=await fetch('/api/mcp/approve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({id:${json(flow.id)}})});const value=await result.json();if(!result.ok)throw new Error(value.error_description||value.error);window.location.assign(value.redirectUrl);}catch(error){document.getElementById('status').textContent=error.message;approve.disabled=false;}};`;
  return clerkPage(
    env,
    code,
    "Sign in and approve access for this integration.",
    "Allow integration",
  );
}
export async function mcpTokenRequest(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim() !==
    "application/x-www-form-urlencoded"
  )
    invalid("Use an application/x-www-form-urlencoded token request");
  const params = new URLSearchParams(await boundedText(request, 8192)),
    input: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in input) invalid("Duplicate token parameters");
    input[key] = value;
  }
  return input;
}
export async function exchangeMcpToken(
  env: Env,
  input: Record<string, unknown>,
) {
  const clientId = text(input, "client_id", 64),
    audience = target(env, input);
  await client(env, clientId);
  const access = `base_mcp_access_${random()}`,
    refresh = `base_mcp_refresh_${random()}`,
    accessHash = await sha(access),
    refreshHash = await sha(refresh),
    guard = random();
  if (input.grant_type === "authorization_code") {
    const codeHash = await sha(text(input, "code", 128)),
      uri = text(input, "redirect_uri", 2048),
      challenge = await pkce(text(input, "code_verifier", 128));
    const row = await env.DB.prepare(
      "SELECT * FROM oauth_codes WHERE hash=? AND consumed=0 AND expires>?",
    )
      .bind(codeHash, now())
      .first<{
        workspace_id: string;
        client_id: string;
        redirect_uri: string;
        challenge: string;
        resource: string;
      }>();
    if (
      !row ||
      row.client_id !== clientId ||
      row.redirect_uri !== uri ||
      row.challenge !== challenge ||
      row.resource !== audience
    )
      throw new OAuthError(
        "invalid_grant",
        "Code or proof is invalid or expired",
      );
    const grant = random();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oauth_codes c JOIN workspaces w ON w.id=c.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE c.hash=? AND c.consumed=0 AND c.expires>? AND a.status='active') THEN 1 ELSE 0 END)",
        ).bind(guard, codeHash, now()),
        env.DB.prepare("UPDATE oauth_codes SET consumed=1 WHERE hash=?").bind(
          codeHash,
        ),
        env.DB.prepare("INSERT INTO oauth_grants VALUES(?,?,?,?,?,0)").bind(
          grant,
          row.workspace_id,
          clientId,
          now(),
          now() + GRANT_TTL,
        ),
        env.DB.prepare(
          "INSERT INTO oauth_tokens VALUES(?,?,'access',?,0)",
        ).bind(accessHash, grant, now() + ACCESS_TTL),
        env.DB.prepare(
          "INSERT INTO oauth_tokens VALUES(?,?,'refresh',?,0)",
        ).bind(refreshHash, grant, now() + GRANT_TTL),
        env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
      ]);
    } catch {
      throw new OAuthError(
        "invalid_grant",
        "Code expired or was already exchanged",
      );
    }
  } else if (input.grant_type === "refresh_token") {
    const hash = await sha(text(input, "refresh_token", 128));
    const row = await env.DB.prepare(
      "SELECT t.*,g.client_id,g.revoked,g.expires AS grant_expires FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN workspaces w ON w.id=g.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE t.hash=? AND t.kind='refresh' AND a.status='active'",
    )
      .bind(hash)
      .first<{
        grant_id: string;
        client_id: string;
        revoked: number;
        consumed: number;
        expires: number;
        grant_expires: number;
      }>();
    if (
      !row ||
      row.client_id !== clientId ||
      row.revoked ||
      row.expires <= now() ||
      row.grant_expires <= now()
    )
      throw new OAuthError(
        "invalid_grant",
        "Refresh token expired or was revoked",
      );
    if (row.consumed) {
      await env.DB.prepare("UPDATE oauth_grants SET revoked=1 WHERE id=?")
        .bind(row.grant_id)
        .run();
      throw new OAuthError(
        "invalid_grant",
        "Refresh token replay detected; reconnect the integration",
      );
    }
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN workspaces w ON w.id=g.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE t.hash=? AND t.consumed=0 AND t.expires>? AND g.revoked=0 AND g.expires>? AND a.status='active') THEN 1 ELSE 0 END)",
        ).bind(guard, hash, now(), now()),
        env.DB.prepare("UPDATE oauth_tokens SET consumed=1 WHERE hash=?").bind(
          hash,
        ),
        env.DB.prepare(
          "INSERT INTO oauth_tokens VALUES(?,?,'access',?,0)",
        ).bind(
          accessHash,
          row.grant_id,
          Math.min(now() + ACCESS_TTL, row.grant_expires),
        ),
        env.DB.prepare(
          "INSERT INTO oauth_tokens VALUES(?,?,'refresh',?,0)",
        ).bind(refreshHash, row.grant_id, row.grant_expires),
        env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
      ]);
    } catch {
      throw new OAuthError(
        "invalid_grant",
        "Refresh token already rotated; retry with the new token",
      );
    }
  } else
    throw new OAuthError(
      "unsupported_grant_type",
      "Use authorization_code or refresh_token",
    );
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refresh,
    scope: "base",
  };
}
export async function authenticateMcp(
  env: Env,
  request: Request,
): Promise<Principal> {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (base_mcp_access_[\w-]{43})$/)?.[1];
  if (!token) throw new HttpError(401, "MCP authorization required");
  const row = await env.DB.prepare(
    "SELECT w.*,g.id AS grant_id FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN workspaces w ON w.id=g.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE t.hash=? AND t.kind='access' AND t.expires>? AND g.expires>? AND g.revoked=0 AND a.status='active'",
  )
    .bind(await sha(token), now(), now())
    .first<WorkspaceRow & { grant_id: string }>();
  if (!row)
    throw new HttpError(401, "MCP authorization expired or was revoked");
  return {
    workspace: row,
    accountId: row.owner_id,
    deviceId: `mcp:${row.grant_id}`,
  };
}
export async function revokeMcpToken(env: Env, input: Record<string, unknown>) {
  const hash = await sha(text(input, "token", 128)),
    clientId = text(input, "client_id", 64);
  await env.DB.prepare(
    "UPDATE oauth_grants SET revoked=1 WHERE client_id=? AND id IN (SELECT grant_id FROM oauth_tokens WHERE hash=?)",
  )
    .bind(clientId, hash)
    .run();
  return {};
}
export async function listMcpGrants(env: Env, principal: Principal) {
  return (
    await env.DB.prepare(
      "SELECT g.id,c.name,g.created_at,g.expires FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.workspace_id=? AND g.revoked=0 AND g.expires>? ORDER BY g.created_at",
    )
      .bind(principal.workspace.id, now())
      .all()
  ).results;
}
export async function revokeMcpGrant(
  env: Env,
  principal: Principal,
  id: string,
) {
  await env.DB.prepare(
    "UPDATE oauth_grants SET revoked=1 WHERE id=? AND workspace_id=?",
  )
    .bind(id, principal.workspace.id)
    .run();
  return { ok: true };
}
