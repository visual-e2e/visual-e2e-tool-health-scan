import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.TOOL_WEB_PORT ?? "5203"),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.TOOL_PORT ?? "3203"}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(webRoot, "dist"),
    emptyOutDir: true,
  },
});
