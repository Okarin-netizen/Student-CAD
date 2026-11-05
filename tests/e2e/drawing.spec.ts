// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function makeBox(page: Page) {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.3);
  await tapCanvas(page, 0.7, 0.7);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
}

test("図面: 第三角法・等角図・キャビネット図をかいて、SVG・DXF で保存できる", async ({ page }) => {
  await makeBox(page);
  await page.getByTestId("open-drawing").click();
  const sheet = page.getByTestId("drawing-sheet");
  await expect(sheet.locator("svg")).toBeVisible();
  await expect(sheet).toContainText("正面図");
  await expect(sheet).toContainText("右側面図");

  await page.getByTestId("drawing-author").fill("技術 太郎");
  await expect(sheet).toContainText("技術 太郎");

  let download = page.waitForEvent("download");
  await page.getByTestId("drawing-svg").click();
  expect((await download).suggestedFilename()).toMatch(/第三角法\.svg$/);
  download = page.waitForEvent("download");
  await page.getByTestId("drawing-dxf").click();
  expect((await download).suggestedFilename()).toMatch(/\.dxf$/);
  download = page.waitForEvent("download");
  await page.getByTestId("drawing-laser").click();
  expect((await download).suggestedFilename()).toMatch(/レーザー用\.dxf$/);

  await page.getByTestId("drawing-isometric").click();
  await expect(sheet).toContainText("等角図");
  await expect(sheet).not.toContainText("正面図");
  await page.getByTestId("drawing-cabinet").click();
  await expect(sheet).toContainText("キャビネット図");

  await page.getByTestId("drawing-close").click();
  await expect(page.getByTestId("new-sketch")).toBeVisible();
});

test("3MF で書き出せる", async ({ page }) => {
  await makeBox(page);
  const download = page.waitForEvent("download");
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-3mf").click();
  expect((await download).suggestedFilename()).toMatch(/\.3mf$/);
});
