import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const target = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { "/api": { target, changeOrigin: false }, "/healthz": { target } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 650 },
});
