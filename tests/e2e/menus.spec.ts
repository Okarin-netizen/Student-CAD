// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test } from "@playwright/test";

test("ひらいたメニューは、外をタップする・Esc・ほかの画面へ進むと とじる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 外(3D の画面)をタップすると とじる
  await page.getByTestId("open-file-menu").click();
  await expect(page.getByTestId("file-new")).toBeVisible();
  await page.getByTestId("viewer-3d").click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("file-new")).toHaveCount(0);

  // Esc で とじる
  await page.getByTestId("open-more").click();
  await expect(page.getByTestId("new-mirror")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("new-mirror")).toHaveCount(0);

  // ボタンをもう一度押しても とじる
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("open-file-menu").click();
  await expect(page.getByTestId("file-new")).toHaveCount(0);

  // メニューをひらいたまま「絵をかく」へ進むと、メニューは残らない
  await page.getByTestId("open-more").click();
  await page.getByTestId("new-sketch").click();
  await expect(page.getByTestId("plane-top")).toBeVisible();
  await expect(page.getByTestId("new-mirror")).toHaveCount(0);
});

test("縦向きのタブレットでも「そのほか」のメニューが画面からはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await page.getByTestId("open-more").click();
  const box = (await page.locator(".more-menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(820);
});
