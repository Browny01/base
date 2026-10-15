import { nodePage, recordHistory } from "./record-sync.ts";
import { requireOwner, requireEditable, workspaceRole } from "./access.ts";
import { listWorkspaces, createWorkspace, inviteMember, acceptInvite, members, changeMember, openWorkspace, ownerUsage, billingPrincipal } from "./workspaces.ts";
import { desktopUpdate } from "./desktop-updates.ts";
import { credentialStatus, saveCredential } from "./credentials.ts";
import { PUBLIC_INTEGRATION_PATHS } from "../../../packages/core/src/providers.ts";
import {
  authenticateMcp,
  oauthMetadata,
  protectedMetadata,
  registerMcpClient,
  mcpConsentPage,
  approveMcpAuthorization,
  mcpTokenRequest,
  exchangeMcpToken,
  revokeMcpToken,
  listMcpGrants,
  revokeMcpGrant,
  OAuthError,
} from "./mcp-oauth.ts";
import { workspaceMcp } from "./mcp.ts";
import { integration } from "./integrations.ts";
import type {
  ScheduledController,
  MessageBatch,
} from "@cloudflare/workers-types";
import {
  authenticate,
  browserSignIn,
  beginDevice,
  approveDevice,
  exchangeDevice,
  revokeDevice,
  signInPage,
  clerkWebhook,
  rateLimit,
  requireSyncDevice,
} from "./auth.ts";
import { checkout, portal, webhook } from "./billing.ts";
import { deleteFile, readFile, upload } from "./files.ts";
import { entitlements, effectivePlan } from "./plans.ts";
import { synchronize, stage } from "./sync.ts";
import { replaceForImport, rollbackImport, snapshot } from "./storage.ts";
import { runJob, schedule } from "./jobs.ts";
import { HttpError, body, now, response, type Env } from "./types.ts";
async function route(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback)
    throw new HttpError(400, "Secure transport is required");
  const origin = request.headers.get("Origin");
  const externalMcp = isPublicMcp(path);
  if (origin && origin !== new URL(env.PUBLIC_URL).origin && !externalMcp)
    throw new HttpError(403, "Origin is not authorized");
  if (method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": externalMcp
          ? "*"
          : new URL(env.PUBLIC_URL).origin,
        "Access-Control-Allow-Methods": "GET,POST,DELETE",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
      },
    });
  const release = await desktopUpdate(request, env);
  if (release) return release;
  if (path === "/api/config" && method === "GET")
    return response({
      clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY ?? "",
      environment: env.ENVIRONMENT,
    });
  if (path === "/api/auth/browser" && method === "POST") {
    await rateLimit(env, request, "browser-login", 10);
    return browserSignIn(env, request, await body(request, 4096));
  }
  if (
    env.ASSETS &&
    !path.startsWith("/api/") &&
    !["/health", "/sign-in", "/account", "/billing"].includes(path) &&
    !path.startsWith("/.well-known/")
  ) {
    if (!["GET", "HEAD"].includes(method))
      throw new HttpError(405, "Method not allowed");
    if (path === "/") url.pathname = "/index.html";
    if (path === "/app" || path === "/app/") url.pathname = "/app/index.html";
    const asset = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(asset.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    if (headers.get("Content-Type")?.includes("text/html")) {
      const host = env.CLERK_ISSUER ? new URL(env.CLERK_ISSUER).origin : "";
      headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' " +
            host +
            " https://challenges.cloudflare.com https://*.protect.clerk.com",
          "style-src 'self' 'unsafe-inline'",
          "worker-src 'self' blob:",
          "connect-src 'self' " +
            host +
            " https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com",
          "img-src 'self' https: data: blob:",
          "font-src 'self' data:",
          "frame-src " +
            host +
            " https://challenges.cloudflare.com https://*.protect.clerk.com",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join(";"),
      );
      headers.set("Cache-Control", "no-cache");
    }
    return new Response(asset.body, { status: asset.status, headers });
  }
  if (path.startsWith("/api/public/")) {
    const target = path.replace("/api/public/", "/api/");
    if (
      !(PUBLIC_INTEGRATION_PATHS as readonly string[]).includes(target) ||
      !["GET", "POST"].includes(method)
    )
      throw new HttpError(404, "Unknown integration");
    if (method === "POST" && target !== "/api/news/summary")
      throw new HttpError(405, "Method not allowed");
    await rateLimit(env, request, "public-integrations", 60);
    url.pathname = target;
    return (
      (await integration(env, new Request(url, request))) ??
      response({ error: "Integration unavailable" }, 404)
    );
  }
  if (path === "/health")
    return response({
      product: "Base Cloud",
      version: "0.1.0",
      environment: env.ENVIRONMENT,
      signInConfigured:
        !!env.CLERK_PUBLISHABLE_KEY &&
        !!env.CLERK_ISSUER &&
        !!(env.CLERK_SECRET_KEY || env.CLERK_JWT_KEY),
      accountEventsConfigured: !!env.CLERK_WEBHOOK_SIGNING_SECRET,
      billingConfigured:
        !!env.STRIPE_PLUS_PRICE_ID &&
        !!env.STRIPE_SECRET_KEY &&
        !!env.STRIPE_WEBHOOK_SECRET,
    });
  if (
    method === "GET" &&
    [
      "/.well-known/oauth-authorization-server",
      "/.well-known/openid-configuration",
    ].includes(path)
  )
    return response(oauthMetadata(env));
  if (
    method === "GET" &&
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ].includes(path)
  )
    return response(protectedMetadata(env));
  if (
    [
      "/api/mcp/register",
      "/api/mcp/token",
      "/api/mcp/revoke",
      "/api/mcp/approve",
      "/api/mcp/authorize",
    ].includes(path)
  ) {
    await rateLimit(env, request, path, path === "/api/mcp/register" ? 10 : 30);
    if (method === "POST" && path === "/api/mcp/register")
      return response(
        await registerMcpClient(env, await body(request, 8192)),
        201,
      );
    if (method === "GET" && path === "/api/mcp/authorize")
      return mcpConsentPage(env, Object.fromEntries(url.searchParams));
    if (method === "POST" && path === "/api/mcp/approve")
      return response(
        await approveMcpAuthorization(env, request, await body(request, 4096)),
      );
    if (method === "POST" && path === "/api/mcp/token")
      return response(
        await exchangeMcpToken(env, await mcpTokenRequest(request)),
      );
    if (method === "POST" && path === "/api/mcp/revoke")
      return response(
        await revokeMcpToken(env, await mcpTokenRequest(request)),
      );
    throw new HttpError(405, "Method not allowed");
  }
  if (method === "GET" && path === "/sign-in")
    return signInPage(env, url.searchParams.get("flow"));
  if (method === "GET" && path === "/account")
    return signInPage(env, null, true);
  if (method === "GET" && path === "/billing")
    return new Response(
      "<!doctype html><html><meta charset=utf-8><title>Base Cloud</title><body><h1>Base Cloud</h1><p>Return to Base to refresh your plan. Billing changes take effect after Stripe confirms them.</p></body></html>",
      {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none';base-uri 'none';frame-ancestors 'none'",
        },
      },
    );
  if (method === "POST" && path === "/api/clerk/webhook")
    return response(await clerkWebhook(env, request));
  if (method === "POST" && path.startsWith("/api/auth/device/"))
    await rateLimit(env, request, path, 30);
  if (method === "POST" && path === "/api/stripe/webhook")
    return response(await webhook(env, request));
  if (method === "POST" && path === "/api/auth/device/start") {
    if (
      !env.CLERK_PUBLISHABLE_KEY ||
      !env.CLERK_ISSUER ||
      !(env.CLERK_SECRET_KEY || env.CLERK_JWT_KEY)
    )
      throw new HttpError(
        503,
        "Base Cloud sign-in setup is not finished yet. Local workspaces remain available.",
      );
    return response(await beginDevice(env, await body(request, 4096)));
  }
  if (method === "POST" && path === "/api/auth/device/approve")
    return response(
      await approveDevice(env, request, await body(request, 4096)),
    );
  if (method === "POST" && path === "/api/auth/device/exchange")
    return response(await exchangeDevice(env, await body(request, 4096)));
  if (path === "/api/mcp") {
    const principal = request.headers
      .get("Authorization")
      ?.startsWith("Bearer base_mcp_access_")
      ? await authenticateMcp(env, request)
      : await authenticate(env, request);
    if (method === "GET")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (method !== "POST") throw new HttpError(405, "Method not allowed");
    const input = await body(request),
      batch = Array.isArray(input),
      messages = batch ? input : [input];
    if (
      messages.length > 50 ||
      messages.some(
        (value: unknown) =>
          !value ||
          typeof value !== "object" ||
          typeof (value as { method?: unknown }).method !== "string" ||
          (value as { jsonrpc?: unknown }).jsonrpc !== "2.0",
      )
    )
      throw new HttpError(400, "Invalid MCP request");
    const engine = workspaceMcp(env, principal),
      values: object[] = [];
    for (const message of messages) {
      const value = await engine.handle(message);
      if (value) values.push(value);
    }
    return values.length
      ? response(batch ? values : values[0])
      : new Response(null, { status: 202 });
  }
  const principal = await authenticate(env, request),
    workspace = principal.workspace.id;
  if (path === "/api/workspaces" && method === "GET") return response({workspaces:await listWorkspaces(env,principal)});
  if (path === "/api/workspaces/create" && method === "POST") return response(await createWorkspace(env,principal,await body(request,4096)),201);
  if (path === "/api/workspaces/accept" && method === "POST") return response(await acceptInvite(env,principal,await body(request,4096)));
  if (path === "/api/workspaces/open" && method === "POST") {
    const session=await openWorkspace(env,principal,await body(request,4096));
    if (request.headers.has("Authorization")) return response(session);
    const {token,...publicSession}=session;
    return Response.json(publicSession,{headers:{"Cache-Control":"no-store","Set-Cookie":`__Host-base_session=${token}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict`}});
  }
  if (path === "/api/workspace/members" && method === "GET") return response({members:await members(env,principal)});
  if (path === "/api/workspace/members" && method === "POST") return response(await changeMember(env,principal,await body(request,4096)));
  if (path === "/api/workspace/invite" && method === "POST") return response(await inviteMember(env,principal,await body(request,4096)));
  if (path === "/api/workspace/credentials" || path === "/api/devices/revoke" || path.startsWith("/api/workspace/integrations") || path.startsWith("/api/workspace/import")) requireOwner(principal);
  if (!["GET","HEAD"].includes(method) && !["/api/native/sync","/api/auth/browser","/api/auth/desktop","/api/billing/checkout","/api/billing/portal","/api/news/summary"].includes(path)) requireEditable(principal);
  if (
    ["/api/native/sync", "/api/native/sync/chunk", "/api/blob/upload"].includes(
      path,
    )
  )
    await requireSyncDevice(env, principal);
  if (path === "/api/workspace/record-history" && method === "GET") return response(await recordHistory(env,principal.workspace,url));
  if (path === "/api/workspace/nodes" && method === "GET") return response(await nodePage(env,workspace,url));
  if (path === "/api/auth/browser" && method === "GET")
    return response({ workspaceId: workspace, deviceId: principal.deviceId, expiresAt: (principal.sessionExpires ?? 0) * 1000 });
  if (path === "/api/auth/browser" && method === "DELETE") {
    await revokeDevice(env, principal, principal.deviceId);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          "__Host-base_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
      },
    });
  }
  if (path === "/api/workspace/credentials" && method === "GET")
    return response(await credentialStatus(env, principal));
  if (path === "/api/workspace/credentials" && method === "POST")
    return response(
      await saveCredential(env, principal, await body(request, 12000)),
    );
  if (path === "/api/auth/desktop" && method === "GET")
    return response({ workspaceId: workspace, deviceId: principal.deviceId });
  if (path === "/api/auth/desktop" && method === "DELETE")
    return response(await revokeDevice(env, principal, principal.deviceId));
  if (path === "/api/native/sync" && method === "POST")
    return response({...await synchronize(env, principal, await body(request)),access:workspaceRole(principal)});
  if (path === "/api/native/sync" && method === "GET") {
    const snap = await snapshot(env, workspace);
    return response({
      protocol: 2,
      workspaceId: workspace,
      revision: snap.workspace.revision,
      data: snap.data,
      applied: [],
      conflicts: [],
    });
  }
  if (path === "/api/native/sync/chunk" && method === "POST") {
    await stage(env, principal, await body(request));
    return response({ ok: true });
  }
  if (path === "/api/workspace/integrations" && method === "GET")
    return response({ integrations: await listMcpGrants(env, principal) });
  if (path === "/api/workspace/integrations/revoke" && method === "POST") {
    const input = await body(request, 4096);
    if (typeof input.id !== "string")
      throw new HttpError(400, "Integration ID required");
    return response(await revokeMcpGrant(env, principal, input.id));
  }
  if (path === "/api/workspace" && method === "GET") {
    const devices = await env.DB.prepare(
      "SELECT id,label,enabled,created_at,last_seen FROM devices WHERE workspace_id=? ORDER BY created_at",
    )
      .bind(workspace)
      .all();
    const account = await env.DB.prepare(
      "SELECT id,display_name,email FROM accounts WHERE id=?",
    )
      .bind(principal.accountId)
      .first();
    const limits = entitlements(principal.workspace);
    return response({
      id: workspace,
      name: principal.workspace.name,
      role: workspaceRole(principal),
      isOwner: principal.accountId === principal.workspace.owner_id,
      mode: "cloud",
      account,
      plan: effectivePlan(principal.workspace),
      planDetails: limits,
      storageBytes:
        await ownerUsage(env, principal.workspace.owner_id),
      storageLimit: limits.storageBytes,
      devices: principal.accountId === principal.workspace.owner_id ? devices.results : [],
      integrations: principal.accountId === principal.workspace.owner_id ? await listMcpGrants(env, principal) : [],
      subscriptionStatus: principal.workspace.subscription_status,
      paidUntil: principal.workspace.paid_until * 1000,
    });
  }
  if (path === "/api/workspace/export" && method === "GET") {
    const snap = await snapshot(env, workspace);
    return response({
      format: "base-workspace-v1",
      workspaceId: workspace,
      revision: snap.workspace.revision,
      data: snap.data,
    });
  }
  if (path === "/api/workspace/import/rollback" && method === "POST") {
    const input = await body(request, 4096);
    if (
      input.confirmation !== "ROLL BACK IMPORT" ||
      typeof input.archiveId !== "string" ||
      input.expectedRevision !== 1
    )
      throw new HttpError(
        400,
        "Rollback requires explicit confirmation and the unchanged import revision",
      );
    return response(
      await rollbackImport(
        env,
        workspace,
        input.archiveId,
        input.expectedRevision,
      ),
    );
  }
  if (path === "/api/workspace/import" && method === "POST") {
    const input = await body(request, 128_000_000);
    if (
      input.confirmation !== "IMPORT INTO EMPTY WORKSPACE" ||
      input.expectedRevision !== 0 ||
      principal.workspace.document_bytes !== 0
    )
      throw new HttpError(
        409,
        "Imports require an empty workspace and explicit confirmation. Existing workspaces remain separate.",
      );
    return response(
      await replaceForImport(
        env,
        workspace,
        0,
        input.data,
        crypto.randomUUID(),
      ),
    );
  }
  if (path === "/api/workspace/history" && method === "GET")
    return response({
      backups: (
        await env.DB.prepare(
          "SELECT id,revision,created_at,expires FROM backups WHERE workspace_id=? AND expires>? ORDER BY created_at DESC LIMIT 100",
        )
          .bind(workspace, now())
          .all()
      ).results,
    });
  if (path.startsWith("/api/workspace/history/") && method === "GET") {
    const id = path.slice("/api/workspace/history/".length);
    const backup = await env.DB.prepare(
      "SELECT key FROM backups WHERE workspace_id=? AND id=? AND expires>?",
    )
      .bind(workspace, id, now())
      .first<{ key: string }>();
    if (!backup) throw new HttpError(404, "Recovery snapshot unavailable");
    const file = await env.FILES.get(backup.key);
    if (!file) throw new HttpError(503, "Recovery snapshot unavailable");
    return new Response(file.body as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Content-Disposition": "attachment",
      },
    });
  }
  if (path === "/api/devices/revoke" && method === "POST") {
    const input = await body(request, 4096);
    if (typeof input.deviceId !== "string")
      throw new HttpError(400, "Device missing");
    return response(await revokeDevice(env, principal, input.deviceId));
  }
  if (path === "/api/billing/checkout" && method === "POST")
    return response(await checkout(env, await billingPrincipal(env, principal)));
  if (path === "/api/billing/portal" && method === "POST")
    return response(await portal(env, await billingPrincipal(env, principal)));
  if (path === "/api/blob/upload" && method === "POST")
    return response(await upload(env, principal, request));
  if (path === "/api/blob/delete" && method === "POST")
    return response(
      await deleteFile(env, principal, await body(request, 4096)),
    );
  if (path.startsWith("/api/files/") && method === "GET")
    return readFile(env, principal, path.slice("/api/files/".length));
  const result = await integration(env, request, principal);
  if (result) return result;
  throw new HttpError(404, "This endpoint is not available on this workspace");
}
function isPublicMcp(path: string) {
  return (
    path === "/api/mcp" ||
    ["/api/mcp/register", "/api/mcp/token", "/api/mcp/revoke"].includes(path) ||
    path.startsWith("/.well-known/")
  );
}
function withMcpHeaders(request: Request, env: Env, result: Response) {
  const path = new URL(request.url).pathname;
  if (!isPublicMcp(path)) return result;
  const headers = new Headers(result.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
  if (path === "/api/mcp" && result.status === 401)
    headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${new URL(env.PUBLIC_URL).origin}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  return new Response(result.body, { status: result.status, headers });
}
const worker = {
  async fetch(request: Request, env: Env) {
    try {
      return withMcpHeaders(request, env, await route(request, env));
    } catch (error) {
      if (error instanceof OAuthError)
        return withMcpHeaders(
          request,
          env,
          response(
            { error: error.code, error_description: error.message },
            error.status,
          ),
        );
      if (error instanceof HttpError)
        return withMcpHeaders(
          request,
          env,
          response({ error: error.message }, error.status),
        );
      console.error(
        "Base Cloud request failed",
        error instanceof Error ? error.name : "Unknown error",
      );
      return response(
        {
          error:
            "The service could not complete this request. Your local data is retained.",
        },
        503,
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await schedule(env);
  },
  async queue(batch: MessageBatch<{ id: string }>, env: Env) {
    for (const message of batch.messages) {
      try {
        await runJob(env, message.body.id);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};

export default worker;
