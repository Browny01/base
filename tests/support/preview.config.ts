import { mergeConfig, defineConfig } from "vite";
import base from "../../apps/desktop/vite.config";
import { fileURLToPath } from "node:url";
const hooks = fileURLToPath(new URL("./preview-store.ts", import.meta.url));
export default mergeConfig(base, defineConfig({
  resolve: { alias: [{ find: "@/lib/hooks", replacement: hooks }] },
  server: { watch: { ignored: ["**/.next/**", "**/dist/**", "**/target/**"] } },
}));
