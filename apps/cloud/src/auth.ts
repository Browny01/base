import { clerkAppearance } from "../../../packages/core/src/clerk-appearance.ts";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { verifyToken } from "@clerk/backend";
import { effectivePlan } from "./plans.ts";
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
export async function clerkIdentity(env: Env, request: Request) {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (
    !token ||
    (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) ||
    !env.CLERK_ISSUER
  )
    throw new HttpError(401, "Sign in with Base Cloud to continue");
  try {
    const claims = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: [new URL(env.PUBLIC_URL).origin],
      clockSkewInMs: 5000,
    });
    if (
      claims.iss !== env.CLERK_ISSUER ||
      claims.sts === "pending" ||
      typeof claims.sub !== "string" ||
      !claims.sub.startsWith("user_")
    )
      throw new Error("Invalid identity");
    return claims.sub;
  } catch {
    throw new HttpError(
      401,
      "Your Cloud sign-in expired. Offline data is retained.",
    );
  }
}
export async function provision(env: Env, account: string) {
  // Client-provided account/workspace IDs are never the source of ownership.
  const id = `base_cloud_${(await sha(account)).slice(0, 40)}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO accounts(id,created_at) VALUES(?,?)",
    ).bind(account, now()),
    env.DB.prepare(
      "INSERT OR IGNORE INTO workspaces(id,owner_id) VALUES(?,?)",
    ).bind(id, account),
  ]);
  const row = await env.DB.prepare(
    "SELECT w.* FROM workspaces w JOIN accounts a ON a.id=w.owner_id WHERE w.id=? AND a.status='active'",
  )
    .bind(id)
    .first<WorkspaceRow>();
  if (!row)
    throw new HttpError(
      403,
      "Account is unavailable. Contact support to export its retained data.",
    );
  return row;
}
export async function authenticate(
  env: Env,
  request: Request,
): Promise<Principal> {
  const authorization = request.headers.get("Authorization");
  const cookie = request.headers
    .get("Cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("__Host-base_session="))
    ?.slice("__Host-base_session=".length);
  const token =
    authorization?.match(/^Bearer (base_desktop_[\w-]{43})$/)?.[1] ??
    (!authorization && /^base_desktop_[\w-]{43}$/.test(cookie ?? "")
      ? cookie
      : undefined);
  if (!authorization && token) {
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== new URL(env.PUBLIC_URL).origin) ||
      (!["GET", "HEAD"].includes(request.method) &&
        origin !== new URL(env.PUBLIC_URL).origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    )
      throw new HttpError(403, "Browser origin is not authorized");
  }
  if (!token) throw new HttpError(401, "Unauthorized");
  const row = await env.DB.prepare(
    "SELECT w.*,s.device_id,s.expires AS session_expires,coalesce(sa.account_id,w.owner_id) AS actor_id,m.role AS member_role FROM sessions s JOIN devices d ON d.workspace_id=s.workspace_id AND d.id=s.device_id JOIN workspaces w ON w.id=s.workspace_id JOIN accounts a ON a.id=w.owner_id LEFT JOIN session_accounts sa ON sa.hash=s.hash JOIN accounts actor ON actor.id=coalesce(sa.account_id,w.owner_id) LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.account_id=sa.account_id WHERE s.hash=? AND s.expires>? AND d.enabled=1 AND a.status='active' AND actor.status='active' AND (coalesce(sa.account_id,w.owner_id)=w.owner_id OR m.account_id IS NOT NULL)",
  )
    .bind(await sha(token), now())
    .first<WorkspaceRow & { device_id: string; session_expires: number; actor_id: string; member_role: "editable" | "viewable" | null }>();
  if (!row)
    throw new HttpError(
      401,
      "Session expired or device revoked. Your offline changes are retained.",
    );
  const expectedWorkspace = request.headers.get("X-Base-Workspace");
  if (expectedWorkspace && expectedWorkspace !== row.id)
    throw new HttpError(
      409,
      "Your browser is signed in to a different workspace. Cached records and offline edits remain separate.",
    );
  // Once a day, on actual requests only; no periodic heartbeat or idle timer.
  await env.DB.prepare(
    "UPDATE devices SET last_seen=? WHERE workspace_id=? AND id=? AND last_seen<?",
  )
    .bind(now(), row.id, row.device_id, now() - 86400)
    .run();
  return { workspace: row, deviceId: row.device_id, accountId: row.actor_id, role: row.member_role ?? undefined, sessionExpires: row.session_expires };
}
export async function beginDevice(env: Env, input: Record<string, unknown>) {
  if (
    typeof input.challenge !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.challenge) ||
    typeof input.deviceId !== "string" ||
    !/^[\w-]{1,200}$/.test(input.deviceId)
  )
    throw new HttpError(400, "Invalid sign-in request");
  if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY || !env.CLERK_ISSUER)
    throw new HttpError(503, "Base Cloud sign-in is not configured yet");
  const id = random(),
    expires = now() + 600;
  await env.DB.prepare(
    "INSERT INTO auth_flows(id,challenge,device_id,expires) VALUES(?,?,?,?)",
  )
    .bind(id, input.challenge, input.deviceId, expires)
    .run();
  return {
    id,
    verificationUrl: `${env.PUBLIC_URL}/sign-in?flow=${id}`,
    expiresAt: expires * 1000,
  };
}
export async function approveDevice(
  env: Env,
  request: Request,
  input: Record<string, unknown>,
) {
  const account = await clerkIdentity(env, request);
  await provision(env, account);
  if (typeof input.id !== "string")
    throw new HttpError(400, "Invalid sign-in request");
  const result = await env.DB.prepare(
    "UPDATE auth_flows SET account_id=? WHERE id=? AND expires>? AND consumed=0 AND (account_id IS NULL OR account_id=?)",
  )
    .bind(account, input.id, now(), account)
    .run();
  if (result.meta.changes !== 1)
    throw new HttpError(
      409,
      "This sign-in request expired or belongs to another account",
    );
  return { ok: true };
}
export async function exchangeDevice(env: Env, input: Record<string, unknown>) {
  if (
    typeof input.id !== "string" ||
    typeof input.verifier !== "string" ||
    input.verifier.length > 200
  )
    throw new HttpError(400, "Invalid device exchange");
  const flow = await env.DB.prepare(
    "SELECT * FROM auth_flows WHERE id=? AND expires>? AND consumed=0",
  )
    .bind(input.id, now())
    .first<{
      challenge: string;
      account_id: string | null;
      device_id: string;
    }>();
  if (!flow)
    throw new HttpError(401, "Sign-in request expired or was already used");
  if (flow.challenge !== (await sha(input.verifier)))
    throw new HttpError(401, "Device verification failed");
  if (!flow.account_id)
    throw new HttpError(
      409,
      "Finish sign-in and approve this device in your browser, then continue",
    );
  const workspace = await provision(env, flow.account_id),
    token = `base_desktop_${random()}`,
    expires = now() + 30 * 86400,
    id = crypto.randomUUID();
  // Consume the proof, allocate a device slot and issue the session atomically.
  // A simultaneous second exchange cannot take a third Free slot.
  const allocation = env.DB.prepare(
    "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM auth_flows WHERE id=? AND consumed=0 AND expires>? AND account_id=?) AND (EXISTS(SELECT 1 FROM devices WHERE workspace_id=? AND id=? AND enabled=1) OR (SELECT count(*) FROM devices WHERE workspace_id=? AND enabled=1)<(SELECT CASE WHEN plan='plus' AND subscription_status IN ('active','trialing') AND paid_until>? THEN 2147483647 ELSE 2 END FROM workspaces WHERE id=?)) THEN 1 ELSE 0 END)",
  ).bind(
    id,
    input.id,
    now(),
    flow.account_id,
    workspace.id,
    flow.device_id,
    workspace.id,
    now(),
    workspace.id,
  );
  try {
    await env.DB.batch([
      allocation,
      env.DB.prepare("UPDATE auth_flows SET consumed=1 WHERE id=?").bind(
        input.id,
      ),
      env.DB.prepare(
        "INSERT INTO devices VALUES(?,?,?,1,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET enabled=1,last_seen=excluded.last_seen",
      ).bind(workspace.id, flow.device_id, "Base desktop", now(), now()),
      env.DB.prepare(
        "DELETE FROM sessions WHERE workspace_id=? AND device_id=?",
      ).bind(workspace.id, flow.device_id),
      env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)").bind(
        await sha(token),
        workspace.id,
        flow.device_id,
        expires,
      ),
      env.DB.prepare("INSERT INTO session_accounts VALUES(?,?)").bind(await sha(token), flow.account_id),
      env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(id),
    ]);
  } catch {
    throw new HttpError(
      402,
      "Free supports two devices. Revoke an old device in Account settings or upgrade to Plus.",
    );
  }
  return {
    token,
    workspaceId: workspace.id,
    deviceId: flow.device_id,
    expiresAt: expires * 1000,
  };
}
export async function revokeDevice(
  env: Env,
  principal: Principal,
  device: string,
) {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE devices SET enabled=0 WHERE workspace_id=? AND id=?",
    ).bind(principal.workspace.id, device),
    env.DB.prepare(
      "DELETE FROM sessions WHERE workspace_id=? AND device_id=?",
    ).bind(principal.workspace.id, device),
  ]);
  return { ok: true };
}

export async function requireSyncDevice(env: Env, principal: Principal) {
  if (effectivePlan(principal.workspace) === "plus") return;
  // A downgrade preserves every device's session and cached data. Two stable
  // slots continue syncing; other devices can still read/export/manage billing
  // and explicitly revoke a device to free a slot. No automatic data removal.
  const active = await env.DB.prepare(
    "SELECT id FROM devices WHERE workspace_id=? AND enabled=1 ORDER BY created_at,id LIMIT 2",
  )
    .bind(principal.workspace.id)
    .all<{ id: string }>();
  if (!active.results.some((device) => device.id === principal.deviceId))
    throw new HttpError(
      402,
      "Free sync supports two devices. This device's offline changes are retained. Revoke an older device in Accounts & Sync or upgrade to Plus; export remains available.",
    );
}
export function clerkPage(
  env: Env,
  code: string,
  description: string,
  button = "Connect this desktop",
  account = false,
) {
  const publishable = env.CLERK_PUBLISHABLE_KEY ?? "";
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(publishable))
    throw new HttpError(503, "Cloud sign-in is not configured");
  let host = "";
  try {
    host = atob(publishable.split("_").at(-1) ?? "").replace(/\$$/, "");
  } catch {
    /* rejected below */
  }
  if (!/^[\w.-]+$/.test(host) || !host.includes("."))
    throw new HttpError(503, "Cloud sign-in is not configured");
  const nonce = random();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${account ? "Account settings" : "Sign in"} — Base</title><link rel="icon" href="/icon-192.png"><style nonce="${nonce}">
@font-face{font-family:'Base Geist';src:url('/fonts/geist-latin.woff2') format('woff2');font-weight:100 900;font-display:swap}*{box-sizing:border-box}:root{--bg:#f8f7f5;--card:#fff;--text:#252524;--muted:#686862;--border:#e6e4df;--accent:#514bd4}html[data-theme=dark]{--bg:#191918;--card:#20201e;--text:#eeeeec;--muted:#aaa9a3;--border:#353530;--accent:#979af5}body{background:var(--bg);color:var(--text);font:14px 'Base Geist',system-ui;margin:0;min-height:100vh}header{height:76px;border-bottom:1px solid var(--border);padding:0 36px;display:flex;align-items:center;justify-content:space-between}a{color:inherit;text-decoration:none}header>a:first-child{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:650;letter-spacing:-.04em}header>a:last-child{font-size:12px;color:var(--muted)}main{max-width:${account ? "1040" : "500"}px;margin:60px auto;padding:0 20px}h1{font-size:32px;letter-spacing:-.04em;font-weight:600;margin:0 0 10px}.description{font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:28px}.identity{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--card)}#clerk:empty{min-height:180px}#clerk .cl-rootBox,#clerk .cl-cardBox{width:100%;max-width:none}.cl-cardBox{box-shadow:none!important}button{cursor:pointer;font:inherit}#approve{background:var(--accent);color:${account ? "white" : "var(--bg)"};padding:12px 18px;border:0;border-radius:9px;font-size:13px;font-weight:550;margin-top:20px}button:disabled{opacity:.5;cursor:wait}.base-change-account{border:1px solid var(--border);background:transparent;color:var(--text);padding:10px 15px;border-radius:9px;margin-top:12px}.base-connect-summary{padding:28px;line-height:1.7}#status{font-size:13px;line-height:1.7;color:var(--muted)}a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}@media(max-width:600px){header{height:64px;padding:0 20px}main{margin:32px auto}h1{font-size:28px}}
</style></head><body><header><a href="/"><img src="/base-icon-rounded.png" width="28" height="28" alt="">Base</a><a href="/app/">Back to Base ↗</a></header><main><h1>${account ? "Your account" : "Welcome to Base"}</h1><p class="description">${description}</p><section class="identity"><div id="clerk"></div></section><button hidden id="approve">${button}</button><p id="status" role="status" aria-live="polite"></p></main><script nonce="${nonce}" crossorigin="anonymous" data-clerk-publishable-key="${publishable}" src="https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js"></script><script nonce="${nonce}">(async()=>{${code}})().catch(()=>document.getElementById('status').textContent='Sign-in unavailable. Please retry.');</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      // Clerk injects runtime styles and uses blob workers and protection hosts.
      // A style nonce would make browsers ignore unsafe-inline and break its UI.
      // Scripts retain nonce protection; only the documented provider hosts load.
      "Content-Security-Policy": `default-src 'none';script-src 'nonce-${nonce}' https://${host} https://challenges.cloudflare.com https://*.protect.clerk.com;style-src 'unsafe-inline';worker-src 'self' blob:;connect-src 'self' https://${host} https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com;img-src 'self' https://img.clerk.com data:;font-src 'self' https://${host} data:;frame-src https://${host} https://challenges.cloudflare.com https://*.protect.clerk.com;base-uri 'none';form-action 'self';frame-ancestors 'none'`,
    },
  });
}

export function signInPage(env: Env, flow: string | null, account = false) {
  if (!account && (!flow || !/^[\w-]{43}$/.test(flow)))
    throw new HttpError(400, "Open Sign in from the Base app");
  const flowJson = JSON.stringify(flow),
    keyJson = JSON.stringify(env.CLERK_PUBLISHABLE_KEY ?? "");
  const appearance = JSON.stringify(clerkAppearance()), darkAppearance = JSON.stringify(clerkAppearance(true));
  const code = `const saved=localStorage.getItem('base_theme');const dark=saved==='dark'||(saved!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';const appearance=dark?${darkAppearance}:${appearance};const clerk=window.Clerk;await clerk.load({publishableKey:${keyJson},appearance});const root=document.getElementById('clerk');const approve=document.getElementById('approve');const signInUrl=new URL(window.location.href);signInUrl.searchParams.delete('auth');const signUpUrl=new URL(signInUrl);signUpUrl.searchParams.set('auth','signup');const signup=new URLSearchParams(location.search).get('auth')==='signup';let mounted='',host=document.createElement('div');root.append(host);
const freshHost=()=>{if(mounted==='signIn')clerk.unmountSignIn(host);if(mounted==='signUp')clerk.unmountSignUp(host);if(mounted==='profile')clerk.unmountUserProfile(host);host=document.createElement('div');root.replaceChildren(host);};
const update=()=>{if(clerk.user){if(${account}){if(mounted!=='profile'){freshHost();clerk.mountUserProfile(host,{appearance});mounted='profile';}return;}if(mounted!=='summary'){freshHost();const summary=document.createElement('div');summary.className='base-connect-summary';const label=document.createElement('p');label.textContent='Connect Base as '+(clerk.user.primaryEmailAddress?.emailAddress||clerk.user.fullName||'your account');summary.append(label);const change=document.createElement('button');change.className='base-change-account';change.textContent='Use another account';change.onclick=()=>clerk.signOut({redirectUrl:signInUrl.href});summary.append(change);host.append(summary);mounted='summary';}approve.hidden=false;}else{if(mounted==='profile')void fetch('/api/auth/browser',{method:'DELETE'}).catch(()=>{});if(mounted!=='signIn'&&mounted!=='signUp'){freshHost();const options={forceRedirectUrl:signInUrl.href,signUpForceRedirectUrl:signInUrl.href,signInForceRedirectUrl:signInUrl.href,signInUrl:signInUrl.href,signUpUrl:signUpUrl.href,appearance};if(signup){clerk.mountSignUp(host,options);mounted='signUp';}else{clerk.mountSignIn(host,options);mounted='signIn';}}approve.hidden=true;}};clerk.addListener(update);update();approve.onclick=async()=>{approve.disabled=true;try{const token=await clerk.session.getToken();const result=await fetch('/api/auth/device/approve',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id:${flowJson}})});const value=await result.json();if(!result.ok)throw new Error(value.error);document.getElementById('status').textContent='Connected. Return to Base and click Complete sign-in.';approve.textContent='Desktop approved';}catch(e){document.getElementById('status').textContent=e.message;approve.disabled=false;}};`;
  return clerkPage(
    env,
    code,
    account
      ? "Your profile, sign-in methods and account security."
      : "Sign in, then approve this desktop connection. Your existing workspaces stay separate.",
    "Connect this desktop",
    account,
  );
}

export async function clerkWebhook(env: Env, request: Request) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET)
    throw new HttpError(503, "Account webhook is not configured");
  const raw = await boundedText(request, 1_000_000);
  let event;
  try {
    event = await verifyWebhook(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: raw,
      }),
      { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET },
    );
  } catch {
    throw new HttpError(400, "Invalid account webhook signature");
  }
  const data = event.data;
  if (
    !("id" in data) ||
    typeof data.id !== "string" ||
    !data.id.startsWith("user_")
  )
    return { ok: true };
  const account = data.id,
    id = `clerk:${request.headers.get("svix-id")}`;
  if (
    (
      await env.DB.prepare("SELECT status FROM webhook_events WHERE id=?")
        .bind(id)
        .first<{ status: string }>()
    )?.status === "done"
  )
    return { ok: true };
  if (event.type === "user.deleted") {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO accounts(id,status,created_at) VALUES(?,'deleted',?) ON CONFLICT(id) DO UPDATE SET status='deleted'",
      ).bind(account, now()),
      env.DB.prepare(
        "DELETE FROM sessions WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id=?) OR hash IN (SELECT hash FROM session_accounts WHERE account_id=?)",
      ).bind(account, account),
      env.DB.prepare(
        "INSERT OR REPLACE INTO webhook_events VALUES(?,?,'done')",
      ).bind(id, now()),
    ]);
  } else if (event.type === "user.created" || event.type === "user.updated") {
    const user = event.data;
    const prior = await env.DB.prepare("SELECT status FROM accounts WHERE id=?")
      .bind(user.id)
      .first<{ status: string }>();
    if (prior?.status === "deleted") {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO webhook_events VALUES(?,?,'done')",
      )
        .bind(id, now())
        .run();
      return { ok: true };
    }
    await provision(env, user.id);
    const email =
      user.email_addresses.find(
        (value) => value.id === user.primary_email_address_id,
      )?.email_address ?? "";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE accounts SET display_name=?,email=?,profile_version=? WHERE id=? AND status='active' AND profile_version<=?",
      ).bind(name, email, user.updated_at, user.id, user.updated_at),
      env.DB.prepare(
        "INSERT OR REPLACE INTO webhook_events VALUES(?,?,'done')",
      ).bind(id, now()),
    ]);
  }
  return { ok: true };
}
export async function rateLimit(
  env: Env,
  request: Request,
  action: string,
  max: number,
) {
  // Cache never decides identity or authorization. SQL bounds unauthenticated
  // requests; the Cloudflare connecting IP is trusted only on the hosted edge.
  const ip = request.headers.get("CF-Connecting-IP") ?? "loopback",
    window = Math.floor(now() / 60),
    bucket = await sha(`${action}/${ip}/${window}`);
  await env.DB.prepare(
    "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
  )
    .bind(bucket, now() + 120)
    .run();
  const row = await env.DB.prepare(
    "SELECT count FROM rate_limits WHERE bucket=?",
  )
    .bind(bucket)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new HttpError(
      429,
      "Too many attempts. Please wait a minute before trying again.",
    );
}

export async function browserSignIn(
  env: Env,
  request: Request,
  input: Record<string, unknown>,
) {
  if (request.headers.get("Origin") !== new URL(env.PUBLIC_URL).origin)
    throw new HttpError(403, "Browser origin is not authorized");
  if (
    typeof input.deviceId !== "string" ||
    !/^browser-[A-Za-z0-9_-]{1,100}$/.test(input.deviceId)
  )
    throw new HttpError(400, "Invalid browser device");
  const verifier = random();
  const flow = await beginDevice(env, {
    challenge: await sha(verifier),
    deviceId: input.deviceId,
  });
  await approveDevice(env, request, { id: flow.id });
  const session = await exchangeDevice(env, { id: flow.id, verifier });
  await env.DB.prepare(
    "UPDATE devices SET label='Base web' WHERE workspace_id=? AND id=?",
  )
    .bind(session.workspaceId, input.deviceId)
    .run();
  return new Response(
    JSON.stringify({
      workspaceId: session.workspaceId,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          "__Host-base_session=" +
          session.token +
          "; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict",
      },
    },
  );
}
