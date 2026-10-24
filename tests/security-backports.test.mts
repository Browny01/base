import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
let require = createRequire(import.meta.url);
for (const parent of ["@next/eslint-plugin-next", "fast-glob", "micromatch"]) require = createRequire(require.resolve(parent));
const braces = require("braces");

test("patched braces retains ordinary expansion and rejects excessive/cyclic AST nesting", () => {
  assert.deepEqual(braces.expand("src/{app,lib}/file-{1..3}.ts"), ["src/app/file-1.ts", "src/app/file-2.ts", "src/app/file-3.ts", "src/lib/file-1.ts", "src/lib/file-2.ts", "src/lib/file-3.ts"]);
  assert.equal(braces.compile("a/{b,c}/d"), "a/(b|c)/d");
  for (const open of ["{", "("]) {
    const pattern = open.repeat(4000) + "a,b" + (open === "{" ? "}" : ")").repeat(4000);
    for (const fn of [braces.parse, braces.compile, braces.expand, braces.stringify]) assert.throws(() => fn(pattern), /maximum nesting depth/);
  }
  let ast: {nodes: unknown[]} = {nodes: []};
  for (let i = 0; i < 1000; i++) ast = {nodes: [ast]};
  for (const fn of [braces.compile, braces.expand, braces.stringify]) assert.throws(() => fn(ast), /maximum nesting depth/);
  const cyclic: {nodes: unknown[]} = {nodes: []}; cyclic.nodes.push(cyclic);
  for (const fn of [braces.compile, braces.expand, braces.stringify]) assert.throws(() => fn(cyclic), /cycle/);
});
