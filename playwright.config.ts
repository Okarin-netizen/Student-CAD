// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { defineConfig, devices } from "@playwright/test";

// 学校の端末に近い画面サイズで、タッチ操作を含めて確認する。
// (CI では WebKit を入れていないので、iPad の画面サイズを Chromium で再現する)
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "ipad-landscape",
      testIgnore: "phone.spec.ts",
      use: {
        browserName: "chromium",
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "chromebook",
      testIgnore: "phone.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    // スマホ(2026-11-21 追加)。たて向き・横向きで、画面の外にはみ出さないかだけを確かめる
    {
      name: "phone-portrait",
      testMatch: "phone.spec.ts",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: "phone-landscape",
      testMatch: "phone.spec.ts",
      use: { browserName: "chromium", viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
});
