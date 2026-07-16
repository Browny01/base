// Client-side streaming for LOCAL providers — the browser talks straight to a
// server running on the user's own machine (Ollama, or a Claude-Code/Codex bridge).
// Vercel's servers can't reach localhost, so this never goes through /api/chat.

import { OLLAMA_PREFIX, BRIDGE_PREFIX } from "@/lib/chat-models";

export interface LocalModel { id: string; label: string; provider: "ollama" | "bridge"; note?: string }
interface Msg { role: "user" | "assistant"; content: string; attachments?: { name: string; kind: string; url?: string; text?: string }[] }

const trim = (u: string) => u.replace(/\/+$/, "");

// blob/data URL → base64 (no data: prefix), for Ollama's `images` array.
async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) return url.slice(url.indexOf(",") + 1);
  const blob = await (await fetch(url)).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export async function discoverOllama(baseUrl?: string): Promise<LocalModel[]> {
  if (!baseUrl) return [];
  try {
    const r = await fetch(`${trim(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const d = await r.json() as { models?: { name: string }[] };
    return (d.models ?? []).map((m) => ({ id: OLLAMA_PREFIX + m.name, label: m.name, provider: "ollama" as const, note: "Local · Ollama" }));
  } catch { return []; }
}

export async function discoverBridge(baseUrl?: string, token?: string): Promise<LocalModel[]> {
  if (!baseUrl) return [];
  try {
    const r = await fetch(`${trim(baseUrl)}/models`, { signal: AbortSignal.timeout(6000), headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) return [];
    const d = await r.json() as { models?: { id: string; label?: string; note?: string }[] };
    return (d.models ?? []).map((m) => ({ id: BRIDGE_PREFIX + m.id, label: m.label || m.id, provider: "bridge" as const, note: m.note || "Local bridge" }));
  } catch { return []; }
}

export interface OllamaOpts { format?: "json"; think?: boolean; numCtx?: number }

export async function streamOllama(baseUrl: string, modelId: string, msgs: Msg[], system: string, onDelta: (t: string) => void, signal: AbortSignal, opts?: OllamaOpts) {
  const messages: Record<string, unknown>[] = [];
  if (system) messages.push({ role: "system", content: system });
  for (const m of msgs) {
    let content = m.content || "";
    const images: string[] = [];
    for (const a of m.attachments ?? []) {
      if (a.kind === "image" && a.url) { try { images.push(await urlToBase64(a.url)); } catch { /* skip */ } }
      else if (a.kind === "text" && a.text) content += `\n\n[File: ${a.name}]\n${a.text}`;
      else content += `\n[attached ${a.kind}: ${a.name}]`;
    }
    messages.push({ role: m.role, content, ...(images.length ? { images } : {}) });
  }
  const body: Record<string, unknown> = {
    // Bigger context so long replies / full course JSON aren't truncated mid-output.
    model: modelId.replace(OLLAMA_PREFIX, ""), messages, stream: true, options: { num_ctx: opts?.numCtx ?? 8192 },
  };
  if (opts?.format) body.format = opts.format;      // "json" constrains output to valid JSON
  if (opts?.think !== undefined) body.think = opts.think; // disable slow "thinking" for structured tasks
  const res = await fetch(`${trim(baseUrl)}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try { const j = JSON.parse(line) as { message?: { content?: string } }; if (j.message?.content) onDelta(j.message.content); } catch { /* partial */ }
    }
  }
}

export async function streamBridge(baseUrl: string, modelId: string, msgs: Msg[], system: string, onDelta: (t: string) => void, signal: AbortSignal, token?: string) {
  const res = await fetch(`${trim(baseUrl)}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      model: modelId.replace(BRIDGE_PREFIX, ""), system,
      messages: msgs.map((m) => ({ role: m.role, content: m.content, attachments: (m.attachments ?? []).map((a) => ({ name: a.name, kind: a.kind, text: a.text })) })),
    }), signal,
  });
  if (!res.ok || !res.body) throw new Error(`Bridge ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  for (;;) { const { done, value } = await reader.read(); if (done) break; onDelta(dec.decode(value, { stream: true })); }
}
