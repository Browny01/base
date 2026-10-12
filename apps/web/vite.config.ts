import { defineConfig, mergeConfig } from "vite";
import desktop from "../desktop/vite.config.ts";
import { fileURLToPath } from "node:url";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default mergeConfig(
  desktop,
  defineConfig({
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
