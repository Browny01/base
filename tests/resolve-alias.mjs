// Lets plain `node --test` resolve the "@/..." path alias that Next.js maps to
// the project root, so modules written with those imports can be unit tested.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      for (const cand of [`${ROOT}${rest}.ts`, `${ROOT}${rest}.tsx`, `${ROOT}${rest}/index.ts`, `${ROOT}${rest}`]) {
        if (existsSync(cand)) {
          return { url: pathToFileURL(cand).href, shortCircuit: true, format: "module-typescript" };
        }
      }
    }
    return next(specifier, context);
  },
});