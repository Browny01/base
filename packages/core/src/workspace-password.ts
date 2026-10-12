/** A workspace privacy gate. Note contents retain their existing storage format. */
export type WorkspaceNotePassword = {
  version: 1;
  iterations: 210000;
  salt: string;
  hash: string;
};
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export function validWorkspaceNotePassword(value: unknown): value is WorkspaceNotePassword {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<WorkspaceNotePassword>;
  if (v.version !== 1 || v.iterations !== 210000 || typeof v.salt !== "string" || typeof v.hash !== "string") return false;
  try { return decode(v.salt).length === 16 && decode(v.hash).length === 32; } catch { return false; }
}
async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: 210000, hash: "SHA-256" }, key, 256));
}
export async function createWorkspaceNotePassword(password: string): Promise<WorkspaceNotePassword> {
  if (Array.from(password).length < 10 || new TextEncoder().encode(password).length > 4096) throw new Error("Use at least 10 characters and no more than 4096 UTF-8 bytes.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { version: 1, iterations: 210000, salt: encode(salt), hash: encode(await derive(password, salt)) };
}
export async function checkWorkspaceNotePassword(password: string, verifier: unknown) {
  if (!password || new TextEncoder().encode(password).length > 4096 || !validWorkspaceNotePassword(verifier)) return false;
  const actual = await derive(password, decode(verifier.salt)), expected = decode(verifier.hash);
  return actual.reduce((difference, value, i) => difference | (value ^ expected[i]), 0) === 0;
}
