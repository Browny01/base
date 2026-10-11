import { apiFetch } from "./api-client.ts";

let verifier: ((password: string) => Promise<boolean>) | null = null;
export function installNoteVerifier(next: (password: string) => Promise<boolean>) { verifier = next; }
/** Notes retain their existing plaintext format; this is a privacy gate. */
export async function verifyNotePassword(password: string): Promise<boolean> {
  if (!password) return false;
  if (verifier) return verifier(password);
  const response = await apiFetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error("Password verification is unavailable. Try again when connected.");
  return true;
}
