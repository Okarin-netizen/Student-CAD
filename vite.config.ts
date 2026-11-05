/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages では https://<user>.github.io/Student-CAD/ に置かれるため、
// 本番ビルドだけ base を付ける。ローカル開発とテストは "/" のまま。
export default defineConfig(({ command }) => ({
  base: command === "build" && process.env.PAGES_BASE ? process.env.PAGES_BASE : "/",
  plugins: [react()],
  worker: { format: "es" },
  optimizeDeps: {
    // WASM を含むパッケージは事前バンドルしない(.wasm の場所がずれるため)
    exclude: ["replicad-opencascadejs", "@salusoft89/planegcs"],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 60_000,
  },
}));
