import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
const root = new URL("../apps/web/dist/", import.meta.url);
async function files(path = "") {
  const entries = await readdir(new URL(path, root), { withFileTypes: true }),
    out = [];
  for (const entry of entries) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await files(name + "/")));
    else if (
      /^(assets\/|fonts\/)|^(icon-192\.png|base-icon-rounded\.png|app\/index\.html)$/.test(
        name,
      )
    )
      out.push("/" + name);
  }
  return out;
}
const urls = await files(),
  digest = createHash("sha256");
for (const url of urls.sort()) {
  digest.update(url);
  digest.update(await readFile(new URL(url.slice(1), root)));
}
const version = digest.digest("hex").slice(0, 12);
const template = await readFile(
  new URL("../apps/web/service-worker.template.js", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("service-worker.js", root),
  template
    .replace("CACHE_VALUE", JSON.stringify("base-ui-" + version))
    .replace("FILES_VALUE", JSON.stringify(urls)),
);
