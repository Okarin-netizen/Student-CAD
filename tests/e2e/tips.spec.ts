// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test } from "@playwright/test";

test("はじめて開いても使い方ガイドは出ない。マウスをのせるとボタンの説明が出る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();
  await expect(page.locator(".tutorial-bubble")).toHaveCount(0);

  await page.getByTestId("new-extrude").hover();
  await expect(page.getByTestId("tip")).toContainText("まっすぐ持ち上げて立体に");
  await page.mouse.move(5, 5);
  await expect(page.getByTestId("tip")).toHaveCount(0);
});

test("タブレットでは長押しで説明が出て、そのボタンは押されない", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByTestId("new-sketch");
  await expect(btn).toBeVisible();
  const box = (await btn.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", bubbles: true, isPrimary: true };
  await btn.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(700);
  await btn.dispatchEvent("pointerup", at);
  await btn.dispatchEvent("click", at);
  await expect(page.getByTestId("tip")).toContainText("形をかきます");
  // 面をえらぶ画面に進んでいない(押したことになっていない)
  await expect(page.getByTestId("plane-top")).toHaveCount(0);

  // ふつうにタップすると押せる
  await btn.click();
  await expect(page.getByTestId("plane-top")).toBeVisible();
});
