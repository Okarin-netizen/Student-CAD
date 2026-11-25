// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 閉じていない線などを、スケッチの画面で赤い印で知らせる(2026-11-25)

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("すき間のある三角は赤い○で知らせ、「はしを つなぐ」で閉じられる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-line").click();
  // 三角をかくが、最後の点を始めの点から少しはなしてしまう
  await tapCanvas(page, 0.3, 0.7);
  await tapCanvas(page, 0.7, 0.7);
  await tapCanvas(page, 0.5, 0.3);
  // 線をかいているとちゅうは、まだ赤い印を出さない
  await expect(page.getByTestId("sketch-issues")).toHaveCount(0);
  await tapCanvas(page, 0.33, 0.62);
  await page.getByTestId("sketch-pending-stop").click();

  await expect(page.locator(".sk-region")).toHaveCount(0);
  await expect(page.getByTestId("issue-end")).toHaveCount(2);
  await expect(page.getByTestId("sketch-issues")).toContainText("形が閉じていません");
  // 知らせをタップすると、上に説明が出る
  await page.getByTestId("sketch-issues-why").click();
  await expect(page.getByTestId("sketch-hint")).toContainText("赤い○");

  await page.getByTestId("sketch-issues-join").click();
  await expect(page.locator(".sk-region")).toHaveCount(1);
  await expect(page.getByTestId("sketch-issues")).toHaveCount(0);
  await expect(page.getByTestId("issue-end")).toHaveCount(0);
});

test("交わった線は赤い×で知らせる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.5, 0.2);
  await tapCanvas(page, 0.5, 0.8);
  await page.getByTestId("sketch-pending-stop").click();
  await expect(page.getByTestId("issue-cross")).toHaveCount(2);
  await expect(page.getByTestId("sketch-issues")).toContainText("使われない線");
});
