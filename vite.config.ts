import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function resolveBasePath(value = process.env.VITE_BASE_PATH): string {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  if (trimmed === "./") {
    return "./";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  optimizeDeps: {
    exclude: ["brotli-wasm"],
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
