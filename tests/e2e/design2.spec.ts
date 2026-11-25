// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// デザインの改善 段階2・3(2026-11-21): 図面の「見せるもの」ボタン、最初から入る大きさの寸法

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("長方形と円には、かいたときから大きさの数字が出て、タップで直せる", async ({ page }) => {
  await page.goto("/?cad");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.3);
  await tapCanvas(page, 0.5, 0.5);
  await expect(page.getByTestId("dim-length")).toHaveCount(2);
  // 位置だけがまだ決まっていない(2つ)
  await expect(page.getByTestId("sketch-dof")).toHaveText("まだ決まっていない所: 2");

  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.7, 0.4);
  await tapCanvas(page, 0.75, 0.4);
  await expect(page.getByTestId("dim-diameter")).toHaveCount(1);

  // 寸法の道具で円をタップすると、新しく足すのではなく、いまの直径を直す
  await page.getByTestId("tool-dimension").click();
  await tapCanvas(page, 0.75, 0.4);
  await expect(page.locator(".numpad")).toContainText("直径を変える");
  await page.getByTestId("numpad-input").fill("12");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("dim-diameter")).toHaveCount(1);
  await expect(page.getByTestId("dim-diameter")).toContainText("12");
});

test("図面の「かくれ線・寸法・等角図」は、押すたびに切りかわるボタン", async ({ page }) => {
  await page.goto("/?cad");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-ok").click();
  await page.getByTestId("open-drawing").click();
  const dims = page.getByTestId("drawing-dims");
  await expect(dims).toHaveAttribute("aria-pressed", "true");
  const box = await dims.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(56);
  await dims.click();
  await expect(dims).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("group", { name: "見せるもの" })).toBeVisible();
});
