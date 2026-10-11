import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { installApiTransport } from "@/lib/api-client";
import { installPrinter } from "@/lib/print-document";
import { installNoteVerifier } from "@/lib/note-lock";
import { installSecretCache } from "@/lib/vault";
import { readStored } from "@/lib/prefs";
import { requestHandoff, HANDOFF_OPEN_NEW_TASK, LEGACY_HANDOFF_OPEN_NEW_TASK } from "@/lib/base-storage";
import { ALL_PAGES } from "@/lib/nav-config";
import { initialize, currentWorkspace, flushLocalWrites } from "./store";
import { native, request, isTauri } from "./native";
import { App } from "./app";
import "./desktop.css";

const theme = readStored("base_theme");
document.documentElement.classList.add(theme === "light" || (theme !== "dark" && !matchMedia("(prefers-color-scheme: dark)").matches) ? "light" : "dark");
document.documentElement.dataset.nav = readStored("base_nav_mode") === "dock" ? "dock" : "sidebar";
const accent = readStored("base_accent");
if (accent) document.documentElement.style.setProperty("--accent", accent);
installApiTransport((input, init) => {
  const workspace = currentWorkspace();
  if (!workspace) return Promise.reject(new Error("Local workspace is not loaded."));
  return request(workspace.scope, input, init);
});
installNoteVerifier(password => native("verify_note_password", { scope: currentWorkspace()?.scope, password }));
const external = (url: string) => { void native("open_external", { url }).catch(error => console.error(String(error))); };
installPrinter(async html => {
  const document = new DOMParser().parseFromString(html,"text/html");
  for (const element of document.querySelectorAll("script,iframe,object,embed,base,form")) element.remove();
  for (const element of document.querySelectorAll("*")) for (const attribute of [...element.attributes]) {
    if (attribute.name.startsWith("on") || /^(javascript|vbscript):/i.test(attribute.value)) element.removeAttribute(attribute.name);
  }
  await native("print_document", { html: `<!doctype html>${document.documentElement.outerHTML}` });
});
document.addEventListener("click", event => {
  const anchor = (event.target as Element).closest?.("a");
  if (anchor && /^(https?:|mailto:)/.test(anchor.getAttribute("href") ?? "")) { event.preventDefault(); external(anchor.href); }
}, true);
const originalOpen = window.open.bind(window);
window.open = ((url?: string | URL, ...args: [string?, string?]) => {
  if (url && /^(https?:|mailto:)/.test(String(url))) { external(String(url)); return null; }
  return originalOpen(url, ...args);
}) as typeof window.open;

function deepLink(urls: string[]) {
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol !== "base:" || url.hostname !== "open" || url.search || url.hash) continue;
      if (ALL_PAGES.some(p => p.href === url.pathname) || url.pathname === "/settings" || /^\/projects\/[\w-]+$/.test(url.pathname)) window.location.hash = url.pathname;
    } catch { /* ignore malformed external input */ }
  }
}
const root = createRoot(document.getElementById("root")!);
let vaultSecret: string | null = null;
installSecretCache({ get: () => vaultSecret, set: secret => { vaultSecret = secret; }, clear: () => { vaultSecret = null; } });
root.render(<div role="status" className="p-6">Opening local workspace…</div>);
if (!isTauri()) {
  root.render(<div className="p-6"><h1 className="text-xl font-semibold">Base</h1><p className="mt-2">Run the Tauri application to use the local SQLite workspace.</p></div>);
} else {
  void (async()=>{
    await getCurrentWindow().onCloseRequested(async event=>{
      event.preventDefault();
      try { await flushLocalWrites();await native("close_window"); }
      catch(error) { console.error(String(error)); }
    });
    await listen("base:exit-requested",()=>{void flushLocalWrites().then(()=>native("finish_exit")).catch(error=>console.error(String(error)));});
    await native("shutdown_ready");
  })().catch(error=>console.error("Close protection unavailable",String(error)));
  initialize().then(async () => {
    window.addEventListener("base:page-ready",()=>{
      void native<boolean>("record_frontend_ready",{frontendMs:performance.now()})
        .then(async profileFrames=>{if(profileFrames)await (await import("./performance")).profileTaskScrolling();})
        .catch(()=>{});
    },{once:true});
    root.render(<App />);
    deepLink((await getCurrent()) ?? []);
    await onOpenUrl(deepLink);
    await listen<string>("base:menu", ({ payload }) => {
      if (payload.startsWith("/")) window.location.hash = payload;
      else if (payload === "new-task") { requestHandoff(HANDOFF_OPEN_NEW_TASK,[LEGACY_HANDOFF_OPEN_NEW_TASK]); window.location.hash = "/tasks"; }
      else if (payload === "command") {
        const event=new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true,cancelable:true});
        (document.activeElement instanceof HTMLElement?document.activeElement:window).dispatchEvent(event);
      }
    });
    window.addEventListener("base:focus-complete", () => {
      void isPermissionGranted().then(granted => { if (granted) sendNotification({ title: "Base", body: "Your focus session is complete." }); });
    });
  }).catch(error => root.render(<div role="alert" className="p-6"><h1 className="text-lg font-semibold">Could not open Base</h1><p className="mt-2">{String(error)}</p><button className="mt-4 underline" onClick={() => window.location.reload()}>Retry</button></div>));
}
