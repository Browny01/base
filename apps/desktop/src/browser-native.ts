import {
  newBrowserState,
  newBrowserWorkspace,
  changeBrowserWorkspace,
  canUseBrowserOffline,
  type BrowserState,
} from "@/packages/sync/src/browser-state";
import { PUBLIC_INTEGRATION_PATHS } from "@/packages/core/src/providers";
import type { Document } from "@/packages/sync/src/protocol";
import { clerkAppearance } from "@/packages/core/src/clerk-appearance";
import { checkWorkspaceNotePassword } from "@/packages/core/src/workspace-password";
import { cloudAttachmentPath } from "@/packages/core/src/service";
type ClerkClient = {
  user: unknown;
  session?: { getToken: () => Promise<string | null> };
  load: (options?: Record<string, unknown>) => Promise<void>;
  addListener: (callback: (state: { user: unknown }) => void) => () => void;
  unmountSignIn: (element: HTMLElement) => void;
  mountSignUp: (element: HTMLElement, options: object) => void;
  unmountSignUp: (element: HTMLElement) => void;
  mountUserProfile: (element: HTMLElement, options?: Record<string, unknown>) => void;
  unmountUserProfile: (element: HTMLElement) => void;
  mountSignIn: (element: HTMLElement, options: object) => void;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};
let clerk: ClerkClient | null = null,
  clerkLoading: Promise<ClerkClient> | null = null;
const encode = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 16384)
    value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(value);
};
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
let database: Promise<IDBDatabase> | null = null;
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("base-browser-v1", 2);
    request.onupgradeneeded = () => {
      for (const name of ["state", "responses"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = null;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  }));
}
export async function browserState<T>(
  write: boolean,
  action: (state: BrowserState) => T,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
        "state",
        write ? "readwrite" : "readonly",
      ),
      store = transaction.objectStore("state"),
      read = store.get("workspace-state");
    let result: T, error: unknown;
    read.onsuccess = () => {
      try {
        const state = (read.result ?? newBrowserState()) as BrowserState;
        result = action(state);
        if (write) store.put(state, "workspace-state");
      } catch (e) {
        error = e;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(
        error ??
          transaction.error ??
          new Error(
            "Browser storage could not save. Export your data before closing.",
          ),
      );
    transaction.onerror = () => {
      error ??= transaction.error;
    };
  });
}
function current(state: BrowserState, scope?: string) {
  if (scope && scope !== state.activeScope)
    throw new Error("Workspace changed. This request was not sent.");
  const workspace = state.workspaces[state.activeScope];
  if (!workspace) throw new Error("Workspace not loaded");
  return workspace;
}
export async function loadClerk() {
  if (clerk) return clerk;
  return (clerkLoading ??= (async () => {
    const config = (await (
      await fetch("/api/config", { cache: "no-store" })
    ).json()) as { clerkPublishableKey: string };
    if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(config.clerkPublishableKey))
      throw new Error("Cloud sign-in is not configured.");
    const host = atob(config.clerkPublishableKey.split("_").at(-1)!).replace(
      /\$$/,
      "",
    );
    if (!/^[\w.-]+$/.test(host))
      throw new Error("Invalid sign-in configuration");
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://" + host + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
      script.crossOrigin = "anonymous";
      script.setAttribute(
        "data-clerk-publishable-key",
        config.clerkPublishableKey,
      );
      script.onload = () => resolve();
      script.onerror = () =>
        reject(
          new Error(
            "Could not reach sign-in. Offline records remain available.",
          ),
        );
      document.head.append(script);
    });
    const value = (window as unknown as { Clerk: ClerkClient }).Clerk;
    await value.load({ appearance: clerkAppearance(document.documentElement.classList.contains("dark")) });
    clerk = value;
    return value;
  })().catch((e) => {
    clerkLoading = null;
    throw e;
  }));
}
export async function browserSignIn() {
  const client = await loadClerk();
  if (!client.user) {
    window.dispatchEvent(new Event("base:browser-sign-in"));
    throw new Error(
      "Sign in in the account panel, then click Connect this account.",
    );
  }
  const token = await client.session?.getToken();
  if (!token) throw new Error("Sign in again to connect.");
  const deviceId = await browserState(true, (s) => s.deviceId);
  const response = await fetch("/api/auth/browser", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ deviceId }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || "Could not connect your account");
  return value as { workspaceId: string; deviceId: string; expiresAt: number };
}
export async function mountBrowserSignIn(element: HTMLElement) {
  const client = await loadClerk();
  if (!client.user)
    client.mountSignIn(element, {
      forceRedirectUrl: location.origin + "/app/",
      signUpForceRedirectUrl: location.origin + "/app/",
    });
  return !!client.user;
}
export async function browserAccess() {
  const cached = await browserState(false, s => ({ workspace: structuredClone(current(s)), access: s.access }));
  const offline = () => canUseBrowserOffline(cached.workspace, cached.access);
  if (!navigator.onLine) return offline();
  try {
    const response = await fetch("/api/auth/browser", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) await browserState(true, s => { delete s.access; });
      return response.status >= 500 ? offline() : false;
    }
    const identity = await response.json() as { workspaceId: string; expiresAt: number };
    if (identity.workspaceId !== cached.workspace.workspaceId || !cached.workspace.origin) return false;
    await browserState(true, s => { current(s, cached.workspace.scope); s.access = identity; });
    return true;
  } catch { return offline(); }
}
export async function mountBrowserAuth(element: HTMLElement, onSignedIn: () => void) {
  const client = await loadClerk();
  const signup = new URLSearchParams(location.search).get("auth") === "signup";
  const unsubscribe = client.addListener(({ user }) => { if (user) onSignedIn(); });
  let mounted = false;
  if (!client.user) {
    mounted = true;
    const options = { forceRedirectUrl: location.origin + "/app/", signUpForceRedirectUrl: location.origin + "/app/", signInForceRedirectUrl: location.origin + "/app/", signInUrl: location.origin + "/app/", signUpUrl: location.origin + "/app/?auth=signup", appearance: clerkAppearance(document.documentElement.classList.contains("dark")) };
    if (signup) client.mountSignUp(element, options); else client.mountSignIn(element, options);
  } else onSignedIn();
  return () => { unsubscribe(); if (mounted) { if (signup) client.unmountSignUp(element); else client.unmountSignIn(element); } };
}

function download(value: Blob, name: string) {
  const url = URL.createObjectURL(value),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function passwordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return encode(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new Uint8Array(salt),
          iterations: 210000,
        },
        key,
        256,
      ),
    ),
  );
}
export async function browserCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  let result: unknown;
  switch (command) {
    case "load_workspace":
      result = await browserState(true, (s) => {
        s.workspaces.local ??= newBrowserWorkspace(
          "local",
          "",
          "local",
          args.defaults as Document,
        );
        return structuredClone(current(s));
      });
      break;
    case "commit_local":
    case "apply_sync":
    case "resolve_conflict":
      result = await browserState(true, (s) =>
        changeBrowserWorkspace(s, command, args),
      );
      break;
    case "cloud_sign_in_start":
      await loadClerk();
      window.dispatchEvent(new Event("base:browser-sign-in"));
      result = {};
      break;
    case "cloud_workspace_open": {
      const previous=await browserState(false,s=>structuredClone(current(s,String(args.scope))));
      if (!previous.origin) throw new Error("Sign in before switching Cloud workspaces");
      const response=await fetch("/api/workspaces/open",{method:"POST",headers:{"Content-Type":"application/json","X-Base-Workspace":previous.workspaceId},body:JSON.stringify({id:args.workspaceId})});
      const identity=await response.json();
      if (!response.ok || identity.workspaceId !== args.workspaceId || typeof identity.expiresAt !== "number") throw new Error(identity.error || "Could not open workspace");
      result=await browserState(true,s=>{
        current(s,previous.scope);
        const scope=location.origin+":"+identity.workspaceId;
        s.workspaces[scope] ??= newBrowserWorkspace(scope,location.origin,identity.workspaceId,args.defaults as Document);
        s.activeScope=scope;
        s.access={workspaceId:identity.workspaceId,expiresAt:identity.expiresAt};
        return structuredClone(current(s));
      });
      break;
    }
    case "cloud_sign_in_finish": {
      const identity = await browserSignIn();
      const defaults = args.defaults as Document;
      result = await browserState(true, (s) => {
        const scope = location.origin + ":" + identity.workspaceId;
        s.workspaces[scope] ??= newBrowserWorkspace(
          scope,
          location.origin,
          identity.workspaceId,
          defaults,
        );
        s.offlineSource ??= s.activeScope;
        s.activeScope = scope;
        s.access = { workspaceId: identity.workspaceId, expiresAt: identity.expiresAt };
        return structuredClone(current(s));
      });
      break;
    }
    case "disconnect_account": {
      const w = await browserState(false, (s) => current(s));
      if (w.origin && navigator.onLine) {
        const r = await fetch("/api/auth/browser", { method: "DELETE" });
        if (!r.ok && r.status !== 401)
          throw new Error(
            "Could not sign out. Your workspace remains selected.",
          );
      }
      result = await browserState(true, (s) => {
        delete s.access;
        s.workspaces.local ??= newBrowserWorkspace(
          "local",
          "",
          "local",
          args.defaults as Document,
        );
        s.activeScope = "local";
        return structuredClone(current(s));
      });
      // Persist local revocation before Clerk can redirect or unload this page.
      if (navigator.onLine) await (await loadClerk()).signOut({ redirectUrl: location.origin + "/app/" });
      break;
    }
    case "api_request": {
      const workspace = await browserState(false, (s) =>
        current(s, String(args.scope)),
      );
      const path = String(args.path),
        method = String(args.method ?? "GET");
      const url = new URL(path, location.origin);
      if (
        !path.startsWith("/api/") ||
        url.origin !== location.origin ||
        url.hash ||
        !["GET", "POST", "DELETE"].includes(method)
      )
        throw new Error("Unsupported API request");
      if (!workspace.origin) {
        if (
          !(PUBLIC_INTEGRATION_PATHS as readonly string[]).includes(
            url.pathname,
          )
        )
          throw new Error("Connect Base Cloud in Settings to use this action.");
        url.pathname = url.pathname.replace("/api/", "/api/public/");
      }
      const headers = new Headers();
      if (workspace.origin)
        headers.set("X-Base-Workspace", workspace.workspaceId);
      if (args.contentType)
        headers.set("Content-Type", String(args.contentType));
      const body = args.bodyBase64
        ? decode(String(args.bodyBase64))
        : undefined;
      let payload: {
        status: number;
        contentType: string;
        bodyBase64: string;
        cached: boolean;
      };
      const cacheable =
        method === "GET" &&
        (PUBLIC_INTEGRATION_PATHS as readonly string[]).includes(
          new URL(path, location.origin).pathname,
        );
      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          credentials: "same-origin",
        });
        await browserState(false, (s) => current(s, workspace.scope));
        const bytes = new Uint8Array(await response.arrayBuffer());
        payload = {
          status: response.status,
          contentType:
            response.headers.get("Content-Type") ?? "application/json",
          bodyBase64: encode(bytes),
          cached: false,
        };
        if (response.status >= 500)
          throw new Error("The integration service could not refresh.");
        if (cacheable && response.ok && bytes.length < 4_000_000)
          void responseCache(workspace.scope, path, payload).catch(() => {});
      } catch (e) {
        await browserState(false, (s) => current(s, workspace.scope));
        const cached = cacheable
          ? await responseCache(workspace.scope, path)
          : null;
        if (!cached) throw e;
        payload = { ...cached, cached: true };
      }
      result = payload;
      break;
    }
    case "export_workspace": {
      const state = await browserState(false, (s) => structuredClone(s));
      download(
        new Blob(
          [
            JSON.stringify(
              {
                format: "base-browser-backup-v1",
                state,
                unsaved: args.unsaved ?? null,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "base-workspace-backup.json",
      );
      break;
    }
    case "list_offline_workspaces":
      result = await browserState(false, (s) =>
        Object.values(s.workspaces)
          .filter((w) => !w.origin)
          .map((w) => ({
            scope: w.scope,
            label: w.scope === "local" ? "Local browser workspace" : w.scope,
          })),
      );
      break;
    case "activate_offline_workspace":
      result = await browserState(true, (s) => {
        const w = s.workspaces[String(args.scope)];
        if (!w || w.origin) throw new Error("Select an offline workspace.");
        s.activeScope = w.scope;
        s.offlineSource = w.scope;
        return structuredClone(w);
      });
      break;
    case "read_offline_source":
      result = await browserState(false, (s) => {
        const w = s.workspaces[s.offlineSource ?? "local"];
        if (!w || w.origin) throw new Error("Select a local source first.");
        return { workspace: structuredClone(w), source: s.archives[w.scope] };
      });
      break;
    case "set_local_note_password": {
      const scope = await browserState(false, (s) => current(s).scope),
        salt = crypto.getRandomValues(new Uint8Array(16)),
        password = String(args.password ?? "");
      if (password.length < 1 || password.length > 4096)
        throw new Error("Enter a note password.");
      const hash = await passwordHash(password, salt);
      await browserState(true, (s) => {
        current(s, scope);
        s.notes[scope] = { salt: encode(salt), hash };
      });
      break;
    }
    case "verify_note_password": {
      const shared = await browserState(false, s => (current(s).document.profile as Record<string, unknown> | undefined)?.notePassword);
      if (shared !== undefined) { result = await checkWorkspaceNotePassword(String(args.password), shared); break; }
      const note = await browserState(false, (s) => s.notes[current(s).scope]);
      if (!note)
        throw new Error(
          "Set a note unlock password on this browser in Accounts & Sync.",
        );
      result =
        (await passwordHash(String(args.password), decode(note.salt))) ===
        note.hash;
      break;
    }
    case "open_external": {
      const url = new URL(String(args.url));
      if (!["https:", "http:", "mailto:"].includes(url.protocol))
        throw new Error("Unsupported link");
      window.open(url.href, "_blank", "noopener,noreferrer");
      break;
    }
    case "print_document": {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      frame.srcdoc = String(args.html);
      document.body.append(frame);
      frame.onload = () => {
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 1000);
      };
      break;
    }
    case "download_workspace_file": {
      const workspace = await browserState(false, (s) =>
        current(s, String(args.scope)),
      );
      const response = await fetch(
        "/api/files/" + encodeURIComponent(String(args.id)),
        { headers: { "X-Base-Workspace": workspace.workspaceId } },
      );
      if (!response.ok) throw new Error("File could not download");
      download(await response.blob(), String(args.name ?? "Attachment"));
      break;
    }
    case "cache_media": {
      const workspace = await browserState(false, (s) => current(s, String(args.scope)));
      const path = cloudAttachmentPath(String(args.url), workspace.origin);
      if (!path || workspace.origin !== location.origin) throw new Error("Browser uses its public image cache.");
      const response = await fetch(path, { credentials: "same-origin", redirect: "error", headers: { "X-Base-Workspace": workspace.workspaceId } });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/") || !response.body) throw new Error("Workspace image is unavailable.");
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Workspace image exceeds the 8 MB cache limit."); }
        chunks.push(value);
      }
      await browserState(false, (s) => current(s, workspace.scope));
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      result = { contentType, bodyBase64: encode(bytes), cached: false };
      break;
    }
    case "check_update":
      result = null;
      break;
    case "import_workspace": {
      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
      });
      if (!file) {
        result = null;
        break;
      }
      if (file.size > 128_000_000)
        throw new Error("Backup is too large for browser import.");
      const archive = JSON.parse(await file.text());
      const source =
        archive.state?.workspaces?.[archive.state.activeScope] ??
        archive.workspace ??
        archive.saved ??
        archive;
      const importedDocument = (archive.unsaved?.document ?? source.document ??
        source.data ??
        source) as Document;
      if (
        !importedDocument ||
        typeof importedDocument !== "object" ||
        Array.isArray(importedDocument) ||
        !["tasks", "projects", "wikiPages", "calendarEvents"].some((key) =>
          Array.isArray(importedDocument[key]),
        )
      )
        throw new Error("Select a Base workspace backup.");
      result = await browserState(true, (s) => {
        const scope = "import-" + crypto.randomUUID();
        s.archives[scope] = archive;
        s.workspaces[scope] = newBrowserWorkspace(
          scope,
          "",
          scope,
          importedDocument,
        );
        if (!args.keepActive) s.activeScope = scope;
        s.offlineSource = scope;
        return structuredClone(s.workspaces[scope]);
      });
      break;
    }
    default:
      throw new Error("This action requires the installed Base app.");
  }
  return result as T;
}

type CachedResponse = {
  status: number;
  contentType: string;
  bodyBase64: string;
  cached: boolean;
};
async function responseCache(
  scope: string,
  path: string,
  value?: CachedResponse,
): Promise<CachedResponse | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("responses", value ? "readwrite" : "readonly"),
      store = tx.objectStore("responses"),
      key = scope + ":" + path;
    let result: CachedResponse | null = null;
    if (value) {
      store.put({ value, touched: Date.now() }, key);
      const all = store.getAllKeys();
      all.onsuccess = () => {
        if (all.result.length > 40) store.delete(all.result[0]);
      };
      result = value;
    } else {
      const read = store.get(key);
      read.onsuccess = () => {
        result = read.result?.value ?? null;
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
  });
}
