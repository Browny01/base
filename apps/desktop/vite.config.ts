import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Never load the root .env.local: it contains backend credentials.
  envDir: local("./"),
  publicDir: local("../../public"),
  resolve: { alias: [
    { find: "@/lib/navigation", replacement: local("./src/navigation.tsx") },
    { find: "@/lib/link", replacement: local("./src/link.tsx") },
    { find: "@/lib/hooks", replacement: local("./src/store.ts") },
    { find: "@/lib/image", replacement: local("./src/media.tsx") },
    { find: "@", replacement: local("../../") },
  ] },
  server: { watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: ["es2021", "safari16.4"], sourcemap: false },
});
