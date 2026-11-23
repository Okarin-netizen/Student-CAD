// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// オフラインで開ける(PWA)・このアプリについて・新しい版の帯(2026-11-23)
// 要求の台帳(docs/requirements.md)の R-NF-03・R-OP-02 を確かめる。

import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("一度開けば、ネットが切れても開いて形を計算できる", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 「このアプリについて」に、しまい終わったことが出るまで待つ
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-about").click();
  await expect(page.getByTestId("about-version")).toContainText("0.9.0");
  await expect(page.getByTestId("about-offline")).toContainText("ネットがなくても開けます", { timeout: 180_000 });
  await page.getByTestId("about-close").click();

  // ネットを切って開き直す
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 計算部品(OpenCascade)もしまってあるので、ひな形から立体を作れる
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-new").click();
  await page.getByTestId("template-nameplate").click();
  await expect(page.getByTestId("save-state")).toContainText("保存ずみ", { timeout: 120_000 });
  await expect(page.getByTestId("feature-tree")).toBeVisible();
  await context.setOffline(false);
});

test("新しい版がしまわれたら帯が出て、「開き直す」で切りかわる", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();
  // 前の版が動きはじめるまで待つ
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active, null, { timeout: 180_000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });

  // 新しい版を公開したことにする: テスト用サーバー(vite preview)が配っている dist/sw.js の版の名前を変える
  const swPath = "dist/sw.js";
  const original = readFileSync(swPath, "utf8");
  writeFileSync(swPath, original.replace(/const BUILD_ID = "([^"]+)"/, 'const BUILD_ID = "$1-next"'));
  // もとにもどすのはテストの最後(とちゅうでもどすと、開き直したときに「また新しい版」に見えるため)
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect(page.getByTestId("update-banner")).toBeVisible({ timeout: 180_000 });

    // 「開き直す」で新しい版に切りかわり、ページが読みこみ直される
    await Promise.all([page.waitForEvent("load"), page.getByTestId("update-apply").click()]);
    await expect(page.getByTestId("new-sketch")).toBeVisible();
    await expect(page.getByTestId("update-banner")).toHaveCount(0);
    const caches = await page.evaluate(() => globalThis.caches.keys());
    expect(caches.some((k) => k.endsWith("-next"))).toBe(true);
    expect(caches.filter((k) => k.startsWith("student-cad-"))).toHaveLength(1);
  } finally {
    writeFileSync(swPath, original);
  }
});
