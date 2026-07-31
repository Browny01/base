import { providerOf, SOURCES_SENTINEL, type PerplexityTool } from "@/lib/chat-models";
import { requireBridgeSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

type Attachment = { name: string; mime: string; kind: "image" | "pdf" | "text"; url?: string; text?: string };
type Msg = { role: "user" | "assistant"; content: string; attachments?: Attachment[] };
const hasContent = (m: Msg) => (m.content && m.content.trim()) || (m.attachments && m.attachments.length);

// Fetch a hosted file (Blob URL) and base64-encode it for provider inline data.
async function urlToBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") || "application/octet-stream";
    return { data: Buffer.from(await r.arrayBuffer()).toString("base64"), mime };
  } catch { return null; }
}

// Return a message as a plain-text body so the client renders it as the reply
// (friendlier than a raw HTTP error — e.g. "no API key set" shows up in chat).
function textResponse(msg: string) {
  return new Response(msg, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const unauthorized = await requireBridgeSession(req); if (unauthorized) return unauthorized;
  let body: unknown;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const b = body as { messages?: Msg[]; model?: string; system?: string; perplexityTools?: PerplexityTool[] };
  const messages = Array.isArray(b.messages) ? b.messages : [];
  const model = typeof b.model === "string" ? b.model : "gemini-2.5-flash";
  const system = typeof b.system === "string" && b.system.trim() ? b.system : undefined;
  const perplexityTools = normalizePerplexityTools(b.perplexityTools);

  const provider = providerOf(model);
  if (provider === "gemini") return streamGemini(model, messages, system);
  if (provider === "anthropic") return streamAnthropic(model, messages, system);
  if (provider === "openai") return streamOpenAI(model, messages, system);
  if (provider === "perplexity") return runPerplexity(model, messages, system, perplexityTools);
  return new Response("Unsupported model", { status: 400 });
}

// ── Gemini (Google Generative Language API, free tier) ─────────────────────────────
async function streamGemini(model: string, messages: Msg[], system?: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return textResponse("⚠️ No GEMINI_API_KEY is set. Add one from aistudio.google.com/apikey, then put it in your environment (Vercel → Settings → Environment Variables → GEMINI_API_KEY) and redeploy.");

  const contents = await Promise.all(
    messages.filter(hasContent).map(async (m) => {
      const parts: Record<string, unknown>[] = [];
      if (m.content && m.content.trim()) parts.push({ text: m.content });
      for (const a of m.attachments ?? []) {
        if (a.kind === "text" && a.text) parts.push({ text: `\n[File: ${a.name}]\n${a.text}` });
        else if ((a.kind === "image" || a.kind === "pdf") && a.url) {
          const b = await urlToBase64(a.url);
          if (b) parts.push({ inlineData: { mimeType: a.mime || b.mime, data: b.data } });
        }
      }
      if (parts.length === 0) parts.push({ text: "" });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    }),
  );

  const payload: Record<string, unknown> = { contents };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${key}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    return textResponse("Couldn't reach Gemini: " + String(e));
  }
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    return textResponse(`Gemini error ${upstream.status}. ${t.slice(0, 400)}`);
  }

  const stream = sseToText(upstream.body, (json) => {
    const parts = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map((p) => p?.text ?? "").join("") : "";
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// ── Anthropic (wired up; enabled once ANTHROPIC_API_KEY is set) ─────────────────────
async function streamAnthropic(model: string, messages: Msg[], system?: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return textResponse("⚠️ Claude isn't set up yet. Add ANTHROPIC_API_KEY to your environment to enable Claude models (or switch back to a Gemini model, which is free).");

  const builtMessages = await Promise.all(
    messages.filter(hasContent).map(async (m) => {
      const blocks: Record<string, unknown>[] = [];
      if (m.content && m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const a of m.attachments ?? []) {
        if (a.kind === "text" && a.text) blocks.push({ type: "text", text: `\n[File: ${a.name}]\n${a.text}` });
        else if (a.kind === "image" && a.url) { const b = await urlToBase64(a.url); if (b) blocks.push({ type: "image", source: { type: "base64", media_type: a.mime || b.mime, data: b.data } }); }
        else if (a.kind === "pdf" && a.url) { const b = await urlToBase64(a.url); if (b) blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.data } }); }
      }
      return { role: m.role, content: blocks.length ? blocks : [{ type: "text", text: "" }] };
    }),
  );
  const payload: Record<string, unknown> = { model, max_tokens: 4096, stream: true, messages: builtMessages };
  if (system) payload.system = system;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return textResponse("Couldn't reach Anthropic: " + String(e));
  }
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    return textResponse(`Anthropic error ${upstream.status}. ${t.slice(0, 400)}`);
  }

  const stream = sseToText(upstream.body, (json) => {
    const j = json as { type?: string; delta?: { type?: string; text?: string } };
    return j?.type === "content_block_delta" && j.delta?.type === "text_delta" ? (j.delta.text ?? "") : "";
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// ── OpenAI Responses API ─────────────────────────────────────────────────────────
async function streamOpenAI(model: string, messages: Msg[], system?: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return textResponse("⚠️ OpenAI isn't set up yet. Add OPENAI_API_KEY to your environment to enable GPT models.");

  const input = await Promise.all(messages.filter(hasContent).map(async (m) => {
    const content: Record<string, unknown>[] = [];
    if (m.content?.trim()) content.push({ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content });
    for (const a of m.attachments ?? []) {
      if (a.kind === "text" && a.text) content.push({ type: "input_text", text: `\n[File: ${a.name}]\n${a.text}` });
      else if (a.kind === "image" && a.url) content.push({ type: "input_image", image_url: a.url });
      else if (a.kind === "pdf") content.push({ type: "input_text", text: `[Attached PDF: ${a.name}]` });
    }
    return { role: m.role, content: content.length ? content : [{ type: "input_text", text: "" }] };
  }));

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input, instructions: system, stream: true, store: false, max_output_tokens: 4096 }),
    });
  } catch (e) {
    return textResponse("Couldn't reach OpenAI: " + String(e));
  }
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    return textResponse(`OpenAI error ${upstream.status}. ${t.slice(0, 400)}`);
  }
  const stream = sseToText(upstream.body, (json) => {
    const event = json as { type?: string; delta?: string };
    return event.type === "response.output_text.delta" ? (event.delta ?? "") : "";
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// ── Perplexity Agent API (multi-provider models + web/URL/finance tools) ───────
async function runPerplexity(model: string, messages: Msg[], system?: string, tools: PerplexityTool[] = []) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return textResponse("⚠️ Perplexity isn't set up yet. Add PERPLEXITY_API_KEY to your environment to enable Perplexity Agent models and tools.");

  const hasImages = messages.some((m) => (m.attachments ?? []).some((a) => a.kind === "image" && a.url));

  // Multimodal (Responses-style) input when images are attached, else a plain string.
  let input: unknown;
  if (hasImages) {
    input = messages.filter(hasContent).map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      const textType = role === "assistant" ? "output_text" : "input_text";
      const content: Record<string, unknown>[] = [];
      if (m.content && m.content.trim()) content.push({ type: textType, text: m.content });
      for (const a of m.attachments ?? []) {
        if (a.kind === "text" && a.text) content.push({ type: "input_text", text: `[File: ${a.name}]\n${a.text}` });
        else if (a.kind === "image" && a.url) content.push({ type: "input_image", image_url: a.url });
        else if (a.kind === "pdf" && a.url) content.push({ type: "input_text", text: `[attached PDF: ${a.name}] ${a.url}` });
      }
      if (content.length === 0) content.push({ type: textType, text: "" });
      return { role, content };
    });
  } else {
    input = messages.filter(hasContent).map((m) => {
      let s = `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`;
      for (const a of m.attachments ?? []) {
        if (a.kind === "text" && a.text) s += `\n\n[File: ${a.name}]\n${a.text}`;
        else s += `\n[attached ${a.kind}: ${a.name}]`;
      }
      return s;
    }).join("\n\n") || "Hello";
  }

  const payload: Record<string, unknown> = {
    model,
    input,
    tools: tools.map((tool) => (
      tool === "web_search"
        ? { type: "web_search", search_context_size: "medium" }
        : { type: tool }
    )),
  };
  if (system) payload.instructions = system;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.perplexity.ai/v1/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return textResponse("Couldn't reach Perplexity: " + String(e));
  }

  const raw = await upstream.text().catch(() => "");
  if (!upstream.ok) return textResponse(`Perplexity error ${upstream.status}. ${raw.slice(0, 500)}`);

  try {
    const { text, sources } = extractPerplexityText(JSON.parse(raw) as unknown);
    const body = (text || "(no response)") + (sources.length ? SOURCES_SENTINEL + JSON.stringify(sources) : "");
    return textResponse(body);
  } catch {
    return textResponse(raw || "(no response)");
  }
}

function normalizePerplexityTools(value: unknown): PerplexityTool[] {
  const valid = new Set<PerplexityTool>(["web_search", "fetch_url", "finance_search"]);
  if (!Array.isArray(value)) return ["web_search", "fetch_url", "finance_search"];
  return value.filter((item): item is PerplexityTool => valid.has(item as PerplexityTool));
}

function extractPerplexityText(json: unknown): { text: string; sources: string[] } {
  const root = json as { output_text?: unknown; output?: unknown };
  const urls = new Set<string>();
  const text: string[] = [];

  const collectUrls = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string" && item.url.startsWith("http")) urls.add(item.url);
    const annotations = item.annotations;
    if (Array.isArray(annotations)) annotations.forEach((a) => { const u = (a as { url?: unknown })?.url; if (typeof u === "string" && u.startsWith("http")) urls.add(u); });
    if (typeof item.text === "string") text.push(item.text);
    Object.values(item).forEach((child) => { if (Array.isArray(child)) child.forEach(collectUrls); else if (child && typeof child === "object") collectUrls(child); });
  };

  if (typeof root.output_text === "string" && root.output_text.trim()) {
    collectUrls(root.output); // still gather citation URLs
    return { text: root.output_text, sources: [...urls].slice(0, 12) };
  }
  collectUrls(root.output);
  return { text: text.join("").trim(), sources: [...urls].slice(0, 12) };
}

// Parse an SSE upstream body, run each `data:` JSON through `pick`, and re-emit
// only the extracted text as a plain-text stream to the browser.
function sseToText(body: ReadableStream<Uint8Array>, pick: (json: unknown) => string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const text = pick(JSON.parse(data));
              if (text) controller.enqueue(enc.encode(text));
            } catch { /* partial or non-JSON keep-alive line */ }
          }
        }
      } catch {
        controller.enqueue(enc.encode("\n\n[stream interrupted]"));
      }
      controller.close();
    },
  });
}
