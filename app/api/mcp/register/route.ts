import { NextRequest } from "next/server";
import { saveClient, randId, OAUTH_CORS } from "@/lib/mcp-oauth";

export const runtime = "nodejs";

// Dynamic Client Registration (RFC 7591). Public client, no secret (PKCE).
export async function POST(req: NextRequest) {
  let body: { redirect_uris?: string[]; client_name?: string } = {};
  try { body = await req.json(); } catch { /* empty registration allowed */ }
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string") : [];
  const client_id = randId(24);
  await saveClient(client_id, { redirect_uris, client_name: body.client_name });
  return new Response(JSON.stringify({
    client_id,
    redirect_uris,
    client_name: body.client_name,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }), { status: 201, headers: { "Content-Type": "application/json", ...OAUTH_CORS } });
}

export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
