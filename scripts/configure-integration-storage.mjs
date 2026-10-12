/** Initialize once; never rotate an existing encryption key or print its bytes. */
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../apps/cloud/", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const names = JSON.parse(
  execFileSync(process.execPath, [cli, "secret", "list"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
).map((v) => v.name);
if (names.includes("INTEGRATION_ENCRYPTION_KEY")) {
  console.log(
    "Secure integration storage already has a key; it was preserved.",
  );
} else {
  const result = spawnSync(
    process.execPath,
    [cli, "secret", "put", "INTEGRATION_ENCRYPTION_KEY"],
    {
      cwd,
      input: randomBytes(32).toString("base64"),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    console.error(
      "Could not initialize secure integration storage; existing secrets were unchanged.",
    );
    process.exit(1);
  }
  console.log(
    "Secure integration storage initialized. The key was sent privately to Worker secrets.",
  );
}
