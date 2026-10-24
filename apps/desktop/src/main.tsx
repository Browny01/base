import { updateInProgress } from "./update-lock";
import { installNotifications, notifyFocusComplete } from "@/lib/notifications";
import { installCredentialActions } from "@/components/integration-settings";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

import { installApiTransport } from "@/lib/api-client";
import { installPrinter } from "@/lib/print-document";
import { installNoteVerifier } from "@/lib/note-lock";
import { checkWorkspaceNotePassword } from "@/packages/core/src/workspace-password";
import { cloudAttachmentPath } from "@/packages/core/src/service";
import { getData } from "@/lib/store";
import { installSecretCache } from "@/lib/vault";
import { readStored } from "@/lib/prefs";
import {
  requestHandoff,
  HANDOFF_OPEN_NEW_TASK,
  LEGACY_HANDOFF_OPEN_NEW_TASK,
} from "@/lib/base-storage";
import { ALL_PAGES } from "@/lib/nav-config";
import {
  initialize,
  currentWorkspace,
  flushLocalWrites,
  unsavedCopy,
  browserSaving,
} from "./store";
import { native, request, isTauri } from "./native";
import { App } from "./app";
import "./desktop.css";

const theme = readStored("base_theme");
document.documentElement.classList.add(
  theme === "light" ||
    (theme !== "dark" && !matchMedia("(prefers-color-scheme: dark)").matches)
    ? "light"
    : "dark",
);
document.documentElement.dataset.nav =
  readStored("base_nav_mode") === "dock" ? "dock" : "sidebar";
const accent = readStored("base_accent");
if (accent) document.documentElement.style.setProperty("--accent", accent);
installApiTransport((input, init) => {
  const workspace = currentWorkspace();
  if (!workspace)
    return Promise.reject(new Error("Local workspace is not loaded."));
  return request(workspace.scope, input, init);
});
installNoteVerifier((password) => {
  const shared = getData().profile?.notePassword;
  if (shared !== undefined) return checkWorkspaceNotePassword(password, shared);
  return native("verify_note_password", {
    scope: currentWorkspace()?.scope,
    password,
  });
});
installCredentialActions({
  status: async () => {
    const workspace = currentWorkspace();
    if (!workspace) throw new Error("Open a workspace first.");
    if (isTauri() && !workspace.workspaceId.startsWith("base_cloud_"))
      return native("integration_status", { scope: workspace.scope });
    const r = await request(workspace.scope, "/api/workspace/credentials");
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v;
  },
  save: async (provider, key) => {
    const workspace = currentWorkspace();
    if (!workspace) throw new Error("Open a workspace first.");
    if (isTauri() && !workspace.workspaceId.startsWith("base_cloud_")) {
      await native("set_integration_key", {
        scope: workspace.scope,
        provider,
        key,
      });
      return;
    }
    const r = await request(workspace.scope, "/api/workspace/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
  },
});
const external = (value: string, name = "Attachment") => {
  const workspace = currentWorkspace();
  const path = workspace ? cloudAttachmentPath(value, workspace.origin) : null;
  const id = path?.split("/").at(-1);
  const operation =
    id && workspace
      ? native("download_workspace_file", { scope: workspace.scope, id, name })
      : native("open_external", { url: value });
  void operation.catch((error) =>
    window.dispatchEvent(
      new CustomEvent("base:download-error", { detail: String(error) }),
    ),
  );
};
installPrinter(async (html) => {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const element of document.querySelectorAll(
    "script,iframe,object,embed,base,form",
  ))
    element.remove();
  for (const element of document.querySelectorAll("*"))
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name.startsWith("on") ||
        /^(javascript|vbscript):/i.test(attribute.value)
      )
        element.removeAttribute(attribute.name);
    }
  await native("print_document", {
    html: `<!doctype html>${document.documentElement.outerHTML}`,
  });
});
if (isTauri())
  document.addEventListener(
    "click",
    (event) => {
      const anchor = (event.target as Element).closest?.("a");
      if (
        anchor &&
        /^(https?:|mailto:)/.test(anchor.getAttribute("href") ?? "")
      ) {
        event.preventDefault();
        external(
          anchor.href,
          anchor.download || anchor.textContent?.trim() || "Attachment",
        );
      }
    },
    true,
  );
const originalOpen = window.open.bind(window);
if (isTauri())
  window.open = ((url?: string | URL, ...args: [string?, string?]) => {
    if (url && /^(https?:|mailto:)/.test(String(url))) {
      external(String(url));
      return null;
    }
    return originalOpen(url, ...args);
  }) as typeof window.open;

function deepLink(urls: string[]) {
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "base:" ||
        url.hostname !== "open" ||
        url.search ||
        url.hash
      )
        continue;
      if (
        ALL_PAGES.some((p) => p.href === url.pathname) ||
        url.pathname === "/settings" ||
        /^\/projects\/[\w-]+$/.test(url.pathname)
      )
        window.location.hash = url.pathname;
    } catch {
      /* ignore malformed external input */
    }
  }
}
if (isTauri())
  installNotifications({
    permission: () => native<NotificationPermission>("notification_permission", { request: false }),
    request: () => native<NotificationPermission>("notification_permission", { request: true }),
    send: async (title, body) => {
      await native("send_notification", { title, body });
    },
  });
window.addEventListener("base:focus-complete", () => {
  void notifyFocusComplete().catch(error => window.dispatchEvent(new CustomEvent("base:notification-error", { detail: String(error) })));
});
const root = createRoot(document.getElementById("root")!);
let vaultSecret: string | null = null;
installSecretCache({
  get: () => vaultSecret,
  set: (secret) => {
    vaultSecret = secret;
  },
  clear: () => {
    vaultSecret = null;
  },
});
root.render(
  <div role="status" className="p-6">
    Opening local workspace…
  </div>,
);
if (!isTauri()) {
  window.addEventListener("beforeunload", (event) => {
    window.dispatchEvent(new Event("base:flush-editors"));
    if (currentWorkspace() && (unsavedCopy() || browserSaving())) {
      event.preventDefault();
    }
  });
  initialize()
    .then(() => root.render(<App />))
    .catch((error) =>
      root.render(
        <div role="alert" className="p-6">
          <h1>Browser storage is unavailable</h1>
          <p>{String(error)}</p>
          <p>Allow site storage or use the installed Base app.</p>
        </div>,
      ),
    );
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker
      .register("/service-worker.js", { scope: "/app/" })
      .catch(() => {});
} else {
  void (async () => {
    await getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await flushLocalWrites();
        await native("close_window");
      } catch (error) {
        console.error(String(error));
      }
    });
    await listen("base:exit-requested", () => {
      void flushLocalWrites()
        .then(() => native("finish_exit"))
        .catch((error) => console.error(String(error)));
    });
    await native("shutdown_ready");
  })().catch((error) =>
    console.error("Close protection unavailable", String(error)),
  );
  initialize()
    .then(async () => {
      window.addEventListener(
        "base:page-ready",
        () => {
          void native<boolean>("record_frontend_ready", {
            frontendMs: performance.now(),
          })
            .then(async (profileFrames) => {
              if (profileFrames)
                await (await import("./performance")).profileTaskScrolling();
            })
            .catch(() => {});
        },
        { once: true },
      );
      root.render(<App />);
      deepLink((await getCurrent()) ?? []);
      await onOpenUrl(deepLink);
      await listen<string>("base:menu", ({ payload }) => {
        if (updateInProgress()) return;
        if (payload.startsWith("/")) window.location.hash = payload;
        else if (payload === "new-task") {
          requestHandoff(HANDOFF_OPEN_NEW_TASK, [LEGACY_HANDOFF_OPEN_NEW_TASK]);
          window.location.hash = "/tasks";
        } else if (payload === "command") {
          const event = new KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          });
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : window
          ).dispatchEvent(event);
        }
      });
    })
    .catch((error) =>
      root.render(
        <div role="alert" className="p-6">
          <h1 className="text-lg font-semibold">Could not open Base</h1>
          <p className="mt-2">{String(error)}</p>
          <button
            className="mt-4 underline"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>,
      ),
    );
}
