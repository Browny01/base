import { createHash } from "node:crypto";

// Fingerprint of a previously published credential. Never accept it again.
const REVOKED = new Set(["884620c0f9d8a1b2ba04940368a601f3ca4a255f2d149a3ce68dd467a8f8c330"]);
export function checkedCredential(value: string | undefined): string | undefined {
  if (value && REVOKED.has(createHash("sha256").update(value).digest("hex"))) {
    throw new Error("An exposed legacy credential is configured. Rotate the service credential before enabling access.");
  }
  return value;
}
