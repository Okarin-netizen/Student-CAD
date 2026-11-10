// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test, type Page } from "@playwright/test";

/** 長方形の絵を1つかく(「そのほか」は絵が1つもないと開けないため。2026-11-10) */
async function drawRect(page: Page) {
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.getByTestId("sketch-done").click();
  await page.locator(".op-panel").getByRole("button", { name: "やめる" }).click();
}

test("ひらいたメニューは、外をタップする・Esc・ほかの画面へ進むと とじる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 外(3D の画面)をタップすると とじる
  await page.getByTestId("open-file-menu").click();
  await expect(page.getByTestId("file-new")).toBeVisible();
  await page.getByTestId("viewer-3d").click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("file-new")).toHaveCount(0);

  // Esc で とじる
  await drawRect(page);
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
  await drawRect(page);
  await page.getByTestId("open-more").click();
  const box = (await page.locator(".more-menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(820);
});

test("絵がないときは、次に押す「絵をかく」が青く、「そのほか」はうすくて押すと案内が出る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toHaveClass(/next/);
  await expect(page.getByTestId("open-more")).toHaveClass(/not-ready/);
  await page.getByTestId("open-more").click({ force: true });
  await expect(page.getByTestId("new-mirror")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("絵をかく");
  await expect(page.getByTestId("toast")).not.toHaveClass(/error/);

  // 絵をかくと「立体にする」が次になり、立体ができると「書き出す」が次になる
  await drawRect(page);
  await expect(page.getByTestId("new-extrude")).toHaveClass(/next/);
  await expect(page.getByTestId("new-sketch")).not.toHaveClass(/next/);
  await page.getByTestId("new-extrude").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("open-export")).toHaveClass(/next/);
  await expect(page.getByTestId("new-fillet")).not.toHaveClass(/not-ready/);
  // れきしはボタンと同じ言葉
  await expect(page.getByTestId("feature-tree")).toContainText("立体1");
  await expect(page.getByTestId("feature-tree")).toContainText("絵1");
});
