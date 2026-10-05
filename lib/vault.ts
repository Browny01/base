// Client-side secret handling.
//
// Two related jobs:
//   1. Hash the login password in the browser at onboarding time, so the server
//      never receives (or stores) the password itself.
//   2. Encrypt the AI provider API key with a key derived from that same
//      password (PBKDF2 → AES-GCM), so a leaked database dump is useless on its
//      own. The decrypted key lives in sessionStorage only, so a briefing
//      request can hand it to the server and a page reload can re-ask for the
//      password rather than keeping it around.
//
// Everything runs in the browser, so it needs Web Crypto (a secure context —
// https or localhost).

import type { SecretBlob } from "@/lib/ai-settings";

const SESSION_SECRET_KEY = "base_vault_secret";
const ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

export interface PasswordVerifier {
  salt: string;      // base64
  iv: string;        // base64
  hash: string;      // base64 AES-GCM ciphertext of an empty plaintext
  iterations: number;
}

// The verifier is a password-encrypted empty block: the login route derives the
// same key from the candidate password and decrypts it, and AES-GCM's auth tag
// only passes for the right one. So the password never leaves the browser and
// the server stores nothing it could replay.
export async function makePasswordVerifier(password: string): Promise<PasswordVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ["encrypt"]);
  const hash = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new Uint8Array(0));
  return { salt: toBase64(salt), iv: toBase64(iv), hash: toBase64(new Uint8Array(hash)), iterations: ITERATIONS };
}

export function serializeVerifier(v: PasswordVerifier): string {
  return `pbkdf2-aesgcm:${v.iterations}:${v.salt}:${v.iv}:${v.hash}`;
}

export async function encryptSecret(secret: string, password: string): Promise<{ cipher: SecretBlob; salt: string; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(secret));
  return { cipher: { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }, salt: toBase64(salt), iterations: ITERATIONS };
}

export async function decryptSecret(cipher: SecretBlob, salt: string, password: string): Promise<string | null> {
  try {
    const key = await deriveKey(password, fromBase64(salt), ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(cipher.iv) as BufferSource },
      key,
      fromBase64(cipher.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null; // wrong password, or the blob was tampered with
  }
}

// ── Session vault ──────────────────────────────────────────────────────────────
// The plaintext password is held in sessionStorage for the tab's lifetime so
// re-encrypting after a settings change doesn't ask for it again. sessionStorage
// (not localStorage) means it disappears when the tab closes.

export function setSessionSecret(password: string): void {
  try {
    sessionStorage.setItem(SESSION_SECRET_KEY, password);
  } catch {
    /* storage disabled — the caller re-prompts instead */
  }
}

export function sessionSecret(): string | null {
  try {
    return sessionStorage.getItem(SESSION_SECRET_KEY);
  } catch {
    return null;
  }
}

export function clearSessionSecret(): void {
  try {
    sessionStorage.removeItem(SESSION_SECRET_KEY);
  } catch {
    /* noop */
  }
}