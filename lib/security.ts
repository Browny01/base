import { createHash, timingSafeEqual } from "node:crypto";

// Hash first so the timing and buffer length do not reveal the length of either
// secret. This is only imported by Node.js route handlers, never client code.
export function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
