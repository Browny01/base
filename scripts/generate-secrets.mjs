#!/usr/bin/env node
// Mint the environment secrets the app needs. Run locally and paste the output
// into Vercel (Settings → Environment Variables → Production):
//
//   node scripts/generate-secrets.mjs            # session + cron secrets
//   node scripts/generate-secrets.mjs "mypass"   # also a BRIDGE_PASSWORD_HASH
//
// BRIDGE_PASSWORD_HASH lets you stop storing the plaintext password on the
// server entirely: it is an scrypt hash of the login password.
import { randomBytes, scryptSync } from "node:crypto";

const urlB64 = (b) => Buffer.from(b).toString("base64url");

const sessionSecret = urlB64(randomBytes(32));
const cronSecret = urlB64(randomBytes(24));

console.log("Paste these into Vercel → Settings → Environment Variables (Production):");
console.log(`\nBRIDGE_SESSION_SECRET=${sessionSecret}`);
console.log(`CRON_SECRET=${cronSecret}`);

const password = process.argv[2];
if (password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  console.log(`BRIDGE_PASSWORD_HASH=${salt.toString("base64")}:${hash.toString("base64")}`);
  console.log("\n(You can then remove BRIDGE_PASSWORD from Vercel if you want.)");
}

console.log("\nTip: also set CRON_SECRET as the schedule's bearer token for the /api/cron/snapshot job if you use Vercel Cron.");