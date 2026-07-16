import { NextRequest } from "next/server";
import { takeCode, saveToken, saveRefresh, validateRefresh, pkceS256, randId, ACCESS_TTL, OAUTH_CORS } from "@/lib/mcp-oauth";

export const runtime = "nodejs";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...OAUTH_CORS } });
}
const oauthErr = (error: string, description?: string, status = 400) => j({ error, error_description: description }, status);

export async function POST(req: NextRequest) {
  // token requests are form-encoded (occasionally JSON)
  const ct = req.headers.get("content-type") || "";
  let params: URLSearchParams;
  if (ct.includes("application/json")) {
    try { params = new URLSearchParams(Object.entries((await req.json()) as Record<string, string>).map(([k, v]) => [k, String(v)])); }
    catch { return oauthErr("invalid_request", "Bad JSON body"); }
  } else {
    params = new URLSearchParams(await req.text());
  }
  const grant = params.get("grant_type");

  if (grant === "authorization_code") {
    const code = params.get("code") || "";
    const redirectUri = params.get("redirect_uri") || "";
    const verifier = params.get("code_verifier") || "";
    const data = await takeCode(code);
    if (!data) return oauthErr("invalid_grant", "Authorization code is invalid or expired.");
    if (data.redirect_uri !== redirectUri) return oauthErr("invalid_grant", "redirect_uri mismatch.");
    if (data.code_challenge) {
      if (!verifier || pkceS256(verifier) !== data.code_challenge) return oauthErr("invalid_grant", "PKCE verification failed.");
    }
    const access = randId(32);
    const refresh = randId(32);
    await saveToken(access);
    await saveRefresh(refresh);
    return j({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: "nexus" });
  }

  if (grant === "refresh_token") {
    const rt = params.get("refresh_token") || "";
    if (!(await validateRefresh(rt))) return oauthErr("invalid_grant", "Refresh token is invalid or expired.");
    const access = randId(32);
    await saveToken(access);
    return j({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: rt, scope: "nexus" });
  }

  return oauthErr("unsupported_grant_type", `grant_type '${grant}' is not supported.`);
}

export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
