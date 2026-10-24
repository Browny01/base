import { defineConfig, mergeConfig } from "vite";
import desktop from "../desktop/vite.config.ts";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const screenshots = ["dashboard.png", "news.png", "notes.png", "habits.png", "mobile.png"];
export default mergeConfig(
  desktop,
  defineConfig({
    plugins: [{ name: "base-web-screenshots", configureServer(server) {
      server.middlewares.use("/screenshots", (request, response, next) => {
        const name = request.url?.split("?")[0].slice(1) ?? "";
        if (!screenshots.includes(name)) return next();
        void readFile(local("./public/screenshots/" + name)).then(bytes => {
          response.setHeader("Content-Type", "image/png"); response.end(bytes);
        }).catch(next);
      });
    }, async generateBundle() {
      for (const name of screenshots) {
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
