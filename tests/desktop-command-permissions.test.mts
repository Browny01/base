import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("every registered desktop command has an explicit application capability", () => {
  const root = new URL("../apps/desktop/src-tauri/", import.meta.url);
  const main = readFileSync(new URL("src/main.rs", root), "utf8")
    .split(".invoke_handler(tauri::generate_handler![")[1]
    .split("])")[0];
  const build = readFileSync(new URL("build.rs", root), "utf8");
  const capability = JSON.parse(
    readFileSync(new URL("capabilities/main.json", root), "utf8"),
  );
  for (const match of main.matchAll(/\w+::(\w+)/g)) {
    const name = match[1];
    assert.ok(
      build.includes('"' + name + '"'),
      name + " missing from build manifest",
    );
    assert.ok(
      capability.permissions.includes("allow-" + name.replaceAll("_", "-")),
      name + " missing from desktop capability",
    );
  }
  assert.ok(!capability.permissions.includes("shell:default"));
});
