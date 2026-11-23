// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** いまのコミットの短い名前(画面の「このアプリについて」に出す)。GitHub Actions では GITHUB_SHA を使う */
function commitId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

/** フォルダの中の全ファイル(下のフォルダもふくむ) */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * オフラインで開くための sw.js を作る(2026-11-23 追加)。
 * ビルドが終わったあと dist の全ファイルを一覧にして、pwa/service-worker.js のひな形の
 * "%BUILD_ID%" と ["%PRECACHE%"] を置きかえる。
 * ファイル名には中身のハッシュが入っているので、一覧が変われば版の名前(BUILD_ID)も変わる。
 */
function pwaPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "student-cad-pwa",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join("/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
        .sort();
      const urls = files.map((f) => (f === "index.html" ? "./" : f));
      const hash = createHash("sha256")
        .update(files.join("\n"))
        .update(readFileSync(join(outDir, "index.html")))
        .digest("hex")
        .slice(0, 10);
      const template = readFileSync(new URL("./pwa/service-worker.js", import.meta.url), "utf8");
      const sw = template
        .replace('"%BUILD_ID%"', JSON.stringify(`${pkg.version}-${hash}`))
        .replace('["%PRECACHE%"]', JSON.stringify(urls, null, 2));
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
}

// GitHub Pages では https://<user>.github.io/Student-CAD/ に置かれるため、
// 本番ビルドだけ base を付ける。ローカル開発とテストは "/" のまま。
export default defineConfig(({ command }) => ({
  base: command === "build" && process.env.PAGES_BASE ? process.env.PAGES_BASE : "/",
  plugins: [react(), pwaPlugin()],
  // 画面の「このアプリについて」に出す版と日付
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitId()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
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
