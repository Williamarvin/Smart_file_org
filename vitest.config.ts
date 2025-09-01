import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/frontend/setup.ts"],
    include: ["test/frontend/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test/", "*.config.ts", "dist/"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@components": path.resolve(__dirname, "./client/src/components"),
      "@lib": path.resolve(__dirname, "./client/src/lib"),
      "@pages": path.resolve(__dirname, "./client/src/pages"),
    },
  },
});
