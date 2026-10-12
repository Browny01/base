// Run in your own terminal. Secret values go straight to Wrangler's stdin;
// nothing writes them to disk, command arguments, environment variables or logs.
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("../apps/cloud/", import.meta.url));
const configPath = new URL("../apps/cloud/wrangler.json", import.meta.url);
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const config = JSON.parse(await readFile(configPath, "utf8"));
if (
  config.name !== "base-cloud-staging" ||
  config.vars.ENVIRONMENT !== "staging"
)
  throw new Error("This helper configures staging only.");
if (!process.stdin.isTTY)
  throw new Error("Run this command in your own interactive terminal.");
async function privateValue(label, prefix) {
  process.stdout.write(label + " (input hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const value = await new Promise((resolve, reject) => {
    let input = "";
    const done = () => {
      process.stdin.off("data", read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const read = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          done();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          done();
          resolve(input.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") input = input.slice(0, -1);
        else if (char >= " ") input += char;
      }
    };
    process.stdin.on("data", read);
  });
  if (!value.startsWith(prefix))
    throw new Error("Unexpected key type; staging requires test/sandbox keys.");
  return value;
}
async function saveSecret(name, value) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "secret", "put", name], {
      cwd: directory,
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Could not save ${name}`)),
    );
    child.stdin.end(value);
  });
}
const input = createInterface({ input: process.stdin, output: process.stdout });
const publishable = (
  await input.question("Clerk DEVELOPMENT publishable key (pk_test_): ")
).trim();
const price = (
  await input.question("Stripe SANDBOX monthly USD price ID (price_): ")
).trim();
input.close();
if (!publishable.startsWith("pk_test_") || !/^price_[A-Za-z0-9]+$/.test(price))
  throw new Error("Invalid staging publishable key or price ID");
const host = Buffer.from(publishable.slice("pk_test_".length), "base64")
  .toString("utf8")
  .replace(/\$$/, "");
if (!/^[\w.-]+\.accounts\.dev$/.test(host))
  throw new Error("Expected a Clerk development domain ending in accounts.dev");
await saveSecret(
  "CLERK_SECRET_KEY",
  await privateValue("Clerk development secret key", "sk_test_"),
);
await saveSecret(
  "STRIPE_SECRET_KEY",
  await privateValue("Stripe sandbox secret API key", "sk_test_"),
);
await saveSecret(
  "CLERK_WEBHOOK_SIGNING_SECRET",
  await privateValue("Clerk development webhook signing secret", "whsec_"),
);
await saveSecret(
  "STRIPE_WEBHOOK_SECRET",
  await privateValue("Stripe sandbox webhook signing secret", "whsec_"),
);
config.vars = {
  ...config.vars,
  CLERK_PUBLISHABLE_KEY: publishable,
  CLERK_ISSUER: `https://${host}`,
  STRIPE_PLUS_PRICE_ID: price,
};
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(
  "Server secrets saved. Only public identifiers were written to the staging config. Run npm run cloud:check and deploy the reviewed staging Worker.",
);
