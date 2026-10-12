import {
  INTEGRATION_PROVIDERS,
  isIntegrationProvider,
  type IntegrationProvider,
} from "../../../packages/core/src/providers.ts";
import { HttpError, now, type Env, type Principal } from "./types.ts";
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function key(env: Env) {
  if (!env.INTEGRATION_ENCRYPTION_KEY)
    throw new HttpError(
      503,
      "Secure integration storage is not configured yet",
    );
  const bytes = decode(env.INTEGRATION_ENCRYPTION_KEY);
  if (bytes.length !== 32)
    throw new HttpError(503, "Secure integration storage is unavailable");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function credentialStatus(env: Env, principal: Principal) {
  const rows = await env.DB.prepare(
    "SELECT provider,updated_at FROM integration_credentials WHERE workspace_id=?",
  )
    .bind(principal.workspace.id)
    .all<{ provider: string; updated_at: number }>();
  return {
    providers: INTEGRATION_PROVIDERS.map((provider) => ({
      id: provider.id,
      configured: rows.results.some((row) => row.provider === provider.id),
    })),
  };
}
export async function saveCredential(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  if (!isIntegrationProvider(input.provider))
    throw new HttpError(400, "Unsupported integration");
  if (input.key === null) {
    await env.DB.prepare(
      "DELETE FROM integration_credentials WHERE workspace_id=? AND provider=?",
    )
      .bind(principal.workspace.id, input.provider)
      .run();
    return { ok: true };
  }
  if (
    typeof input.key !== "string" ||
    !input.key.trim() ||
    input.key.length > 8192 ||
    /[\r\n]/.test(input.key)
  )
    throw new HttpError(400, "Enter a valid integration key");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(
        `${principal.workspace.id}:${input.provider}`,
      ),
    },
    await key(env),
    new TextEncoder().encode(input.key.trim()),
  );
  await env.DB.prepare(
    "INSERT INTO integration_credentials VALUES(?,?,?,?) ON CONFLICT(workspace_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at",
  )
    .bind(
      principal.workspace.id,
      input.provider,
      `v1:${encode(iv)}:${encode(new Uint8Array(encrypted))}`,
      now(),
    )
    .run();
  return { ok: true };
}
export async function readCredential(
  env: Env,
  principal: Principal,
  provider: IntegrationProvider,
) {
  const row = await env.DB.prepare(
    "SELECT ciphertext FROM integration_credentials WHERE workspace_id=? AND provider=?",
  )
    .bind(principal.workspace.id, provider)
    .first<{ ciphertext: string }>();
  if (!row) return undefined;
  try {
    const [version, iv, ciphertext] = row.ciphertext.split(":");
    if (version !== "v1") throw new Error("Unknown secret format");
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: decode(iv),
          additionalData: new TextEncoder().encode(
            `${principal.workspace.id}:${provider}`,
          ),
        },
        await key(env),
        decode(ciphertext),
      ),
    );
  } catch {
    throw new HttpError(
      503,
      "This integration key could not be unlocked. Reconnect it in Settings.",
    );
  }
}
