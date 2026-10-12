import { defineConfig, mergeConfig } from "vite";
import desktop from "../desktop/vite.config.ts";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default mergeConfig(
  desktop,
  defineConfig({
    plugins: [{ name: "base-web-screenshots", async generateBundle() {
      for (const name of ["dashboard.png", "dashboard.webp", "news.png", "news.webp"]) {
        this.emitFile({ type: "asset", fileName: "screenshots/" + name, source: await readFile(local("./public/screenshots/" + name)) });
      }
    } }],
    root: local("./"),
    envDir: local("./"),
    build: {
      outDir: local("./dist"),
      rollupOptions: {
        input: {
          landing: local("./index.html"),
          app: local("./app/index.html"),
        },
      },
    },
    server: { proxy: { "/api": "http://127.0.0.1:8987" } },
  }),
);
