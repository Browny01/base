import { createDecipheriv, pbkdf2 } from "crypto";
import { promisify } from "util";
import { mcpRedis } from "@/lib/mcp-data";
import { AUTH_PASSWORD_KEY, PREVIOUS_AUTH_PASSWORD_KEYS, readMigrating } from "@/lib/base-data";

// A password chosen during onboarding lives in Redis next to the data, not in
// env vars — the person running their own copy shouldn't have to edit a
// deployment config to lock it down.
//
// It arrives from the browser as `pbkdf2-aesgcm:<iterations>:<salt>:<iv>:<ct>`:
// a password-derived AES-GCM encryption of an empty plaintext. Verifying means
// re-deriving the key from the candidate password and decrypting, so the stored
// value can't be replayed and the plaintext password never reaches the server.
//
// Env vars still win: if BASE_PASSWORD / BASE_PASSWORD_HASH is set, that
// operator-supplied credential is authoritative and onboarding may not replace it.

const pbkdf2Async = promisify(pbkdf2) as (
  password: string,
  salt: Buffer,
  iterations: number,
  keylen: number,
  digest: string,
) => Promise<Buffer>;

export interface StoredVerifier {
  iterations: number;
  salt: string;
  iv: string;
  hash: string;
}

export function parseVerifier(value?: string | null): StoredVerifier | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2-aesgcm") return null;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 100_000 || iterations > 5_000_000) return null;
  if (!parts[2] || !parts[3] || !parts[4]) return null;
  return { iterations, salt: parts[2], iv: parts[3], hash: parts[4] };
}

export async function readStoredVerifier(): Promise<StoredVerifier | null> {
  const redis = mcpRedis();
  if (!redis) return null;
  try {
    return parseVerifier(await readMigrating(redis, AUTH_PASSWORD_KEY, PREVIOUS_AUTH_PASSWORD_KEYS));
  } catch {
    return null;
  }
}

export async function writeStoredVerifier(verifier: string): Promise<boolean> {
  const redis = mcpRedis();
  if (!redis) return false;
  if (!parseVerifier(verifier)) return false;
  await redis.set(AUTH_PASSWORD_KEY, verifier);
  return true;
}

export async function verifyStoredPassword(password: string, verifier: StoredVerifier): Promise<boolean> {
  try {
    const key = await pbkdf2Async(password, Buffer.from(verifier.salt, "base64"), verifier.iterations, 32, "sha256");
    // A wrong password fails the AES-GCM auth tag and throws, which is exactly
    // the check we want.
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(verifier.iv, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(verifier.hash, "base64")), decipher.final()]);
    return plain.length === 0;
  } catch {
    return false;
  }
}