// Shared file-attachment processing for the chat composer and the dashboard ask bar.
"use client";

import { uid } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/store";

const TEXT_EXT = /\.(md|markdown|txt|json|csv|tsx?|jsx?|py|java|c|cpp|h|cs|go|rb|rs|php|html?|css|scss|ya?ml|sh|sql|xml|toml|ini|env)$/i;
const isTextFile = (name: string, mime: string) => mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name);

async function uploadBinary(body: Blob, filename: string, contentType: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/blob/upload?filename=${encodeURIComponent(filename)}`, { method: "POST", headers: { "Content-Type": contentType }, body });
    const { url } = await res.json();
    return typeof url === "string" ? url : null;
  } catch { return null; }
}

function downscaleImage(file: File, max = 1400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("blob failed"))), "image/jpeg", 0.85);
      };
      img.onerror = reject; img.src = r.result as string;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

async function toBase64Url(blob: Blob): Promise<string> {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
}

export async function processFile(file: File): Promise<ChatAttachment> {
  const id = uid();
  if (file.type.startsWith("image/")) {
    const blob = await downscaleImage(file).catch(() => file);
    const url = await uploadBinary(blob, `chat-${Date.now()}.jpg`, "image/jpeg");
    return { id, name: file.name, mime: "image/jpeg", kind: "image", size: blob.size, url: url ?? (await toBase64Url(blob)) };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const url = await uploadBinary(file, `chat-${Date.now()}-${file.name}`, "application/pdf");
    return { id, name: file.name, mime: "application/pdf", kind: "pdf", size: file.size, url: url ?? (await toBase64Url(file)) };
  }
  if (isTextFile(file.name, file.type)) {
    const text = (await file.text()).slice(0, 200000);
    return { id, name: file.name, mime: file.type || "text/plain", kind: "text", size: file.size, text };
  }
  return { id, name: file.name, mime: file.type || "application/octet-stream", kind: "text", size: file.size, text: `(binary file "${file.name}", ${file.size} bytes — not readable as text)` };
}
