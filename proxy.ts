import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bridgeAgentToken } from "@/lib/env";
import { verifySession } from "@/lib/session";

const COOKIE = "bridge_auth";

const OAUTH_META_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "frame-src 'self' blob: https://www.youtube.com https://player.vimeo.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

// Baseline hardening headers applied to every app response.
function harden(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "SAMEORIGIN");                       // clickjacking
  res.headers.set("X-Content-Type-Options", "nosniff");                   // MIME sniffing
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");  // leak less on outbound links
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return res;
}

function isCrossSiteMutation(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== request.nextUrl.origin) return true;
    } catch {
      return true;
    }
  }
  return request.headers.get("sec-fetch-site") === "cross-site";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const agentToken = bridgeAgentToken();

  // Browser mutations must originate from Bridge. Bearer-authenticated external
  // integrations are exempt because they do not rely on ambient cookies.
  const externalApi = pathname.startsWith("/api/mcp")
    || pathname.startsWith("/api/agent")
    || pathname.startsWith("/api/widget")
    || pathname.startsWith("/api/cron");
  if (pathname.startsWith("/api/") && !externalApi && isCrossSiteMutation(request)) {
    return harden(NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 }));
  }

  // ── OAuth discovery metadata for the MCP server (public, no auth) ──────────────
  const origin = request.nextUrl.origin;
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
    return harden(NextResponse.json(
      { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["bridge"] },
      { headers: OAUTH_META_CORS },
    ));
  }
  if (pathname.startsWith("/.well-known/oauth-authorization-server") || pathname.startsWith("/.well-known/openid-configuration")) {
    return harden(NextResponse.json({
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/authorize`,
      token_endpoint: `${origin}/api/mcp/token`,
      registration_endpoint: `${origin}/api/mcp/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["bridge"],
    }, { headers: OAUTH_META_CORS }));
  }

  // Always allow: login page, auth API, Next.js internals, static assets.
  // Also allow the cron endpoint and the public market-data proxies it calls
  // (these expose only public blockchain/FX data — no private user data).
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/mcp") ||   // MCP server does its own Bearer-token auth
    pathname.startsWith("/api/widget") || // iOS widget summary — does its own token auth
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/wallet") ||
    pathname.startsWith("/api/fx") ||
    pathname.startsWith("/api/market") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/bridge-mark.png" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    (pathname.startsWith("/icon-") && pathname.endsWith(".png")) ||
    pathname === "/manifest.json"
  ) {
    return harden(NextResponse.next());
  }

  if (pathname.startsWith("/api/agent")) {
    const auth = request.headers.get("authorization");
    if (agentToken && auth === `Bearer ${agentToken}`) {
      return harden(NextResponse.next());
    }
    return harden(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const auth = request.cookies.get(COOKIE);
  let authenticated = false;
  try {
    authenticated = await verifySession(auth?.value);
  } catch (error) {
    console.error("[bridge/proxy session]", error);
  }
  if (!authenticated) {
    return harden(NextResponse.redirect(new URL("/login", request.url)));
  }

  return harden(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
