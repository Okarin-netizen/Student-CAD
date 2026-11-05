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

  await page.getByTestId("drawing-student-id").fill("2312");
  await page.getByTestId("drawing-author").fill("技術 太郎");
  await expect(sheet).toContainText("2312 技術 太郎");

  let download = page.waitForEvent("download");
  await page.getByTestId("drawing-svg").click();
  expect((await download).suggestedFilename()).toBe("2312_技術太郎_新しい作品_第三角法.svg");
  download = page.waitForEvent("download");
  await page.getByTestId("drawing-dxf").click();
  expect((await download).suggestedFilename()).toMatch(/\.dxf$/);
  download = page.waitForEvent("download");
  await page.getByTestId("drawing-laser").click();
  expect((await download).suggestedFilename()).toMatch(/レーザー用\.dxf$/);

  // 印刷(PDF に保存)するときは、ページの題名を「学籍番号_氏名_作品名」にする(PDF のファイル名になる)
  await page.evaluate(() => {
    window.print = () => {
      (window as unknown as { printedTitle: string }).printedTitle = document.title;
    };
  });
  await page.getByTestId("drawing-print").click();
  expect(await page.evaluate(() => (window as unknown as { printedTitle: string }).printedTitle)).toBe("2312_技術太郎_新しい作品");

  await page.getByTestId("drawing-isometric").click();
  await expect(sheet).toContainText("等角図");
  await expect(sheet).not.toContainText("正面図");
  await page.getByTestId("drawing-cabinet").click();
  await expect(sheet).toContainText("キャビネット図");

  await page.getByTestId("drawing-close").click();
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 作った人は作品に残り、開き直しても表題欄に入る。印刷(PDF)のときのページの題名が PDF のファイル名になる
  await page.reload();
  await page.getByTestId("open-drawing").click();
  await expect(page.getByTestId("drawing-sheet")).toContainText("2312 技術 太郎");
});

test("図面: 寸法を手で足して消し、自動の寸法も消してから もとにもどせる", async ({ page }) => {
  await makeBox(page);
  await page.getByTestId("open-drawing").click();
  const sheet = page.getByTestId("drawing-sheet");
  const texts = sheet.locator("svg > g text");
  await expect(texts.first()).toBeVisible();
  const before = await texts.count();

  // 正面図の点(●)を2つタップして足す
  await page.getByTestId("dim-add").click();
  const dots = sheet.locator(".snap-dot");
  await expect(dots.first()).toBeAttached();
  await dots.nth(0).click({ force: true });
  await expect(sheet.locator(".snap-picked")).toBeAttached();
  await dots.nth(1).click({ force: true });
  await expect(texts).toHaveCount(before + 1);

  // 足した寸法の数字をタップして消す(足した寸法は最後にかかれる数字)
  await page.getByTestId("dim-erase").click();
  const dimTexts = sheet.locator("svg > g text").filter({ hasText: /^[0-9.]+$/ });
  await dimTexts.last().click({ force: true });
  await expect(texts).toHaveCount(before);
  await expect(page.getByTestId("dim-reset")).toHaveCount(0);

  // 自動の寸法を1つ消して、もとにもどす
  await dimTexts.first().click({ force: true });
  await expect(texts).toHaveCount(before - 1);
  await page.getByTestId("dim-reset").click();
  await expect(texts).toHaveCount(before);
});

test("3MF で書き出せる", async ({ page }) => {
  await makeBox(page);
  const download = page.waitForEvent("download");
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-3mf").click();
  expect((await download).suggestedFilename()).toMatch(/\.3mf$/);
});
