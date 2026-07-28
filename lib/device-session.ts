import { bridgeSessionSecret } from "@/lib/env";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

async function signature(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(bridgeSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function createDeviceToken(deviceId: string, days = 365): Promise<string> {
  const payload = base64Url(encoder.encode(JSON.stringify({
    deviceId: deviceId.slice(0, 120),
    exp: Date.now() + days * 86_400_000,
  })));
  return `${payload}.${await signature(payload)}`;
}

export async function verifyDeviceToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return false;
  const expected = await signature(payload);
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < supplied.length; index++) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (difference !== 0) return false;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
