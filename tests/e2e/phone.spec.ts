// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// スマホ(たて・横)で、ボタンやパネルが画面の外に出ず、3D と絵をかく所が広く使えるかを確かめる。
// 2026-11-21 スマホ対応で追加。playwright.config.ts の phone-portrait / phone-landscape だけで動かす。
import { expect, test, type Locator, type Page } from "@playwright/test";

/** 要素が画面(ビューポート)の中に全部見えているか */
async function expectInsideViewport(page: Page, el: Locator) {
  const box = (await el.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
}

/** 長方形をかいて、立体にするパネルまで進める */
async function drawRect(page: Page) {
  await page.getByTestId("new-sketch").tap();
  await page.getByTestId("plane-top").tap();
  await page.getByTestId("tool-rect").tap();
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await page.touchscreen.tap(box.x + box.width * 0.65, box.y + box.height * 0.6);
  await expect(page.locator(".sk-region")).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?cad");
  await expect(page.getByTestId("new-sketch")).toBeVisible();
});

test("ページが横にはみ出さず、3D が画面の半分以上を使える", async ({ page }) => {
  const vp = page.viewportSize()!;
  const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(size[0]).toBeLessThanOrEqual(vp.width);
  expect(size[1]).toBeLessThanOrEqual(vp.height);

  // 手順バーは1段(横にスクロールする)
  const bar = (await page.locator(".stepbar").boundingBox())!;
  expect(bar.height).toBeLessThan(70);
  // 3D の場所
  const stage = (await page.locator(".stage").boundingBox())!;
  expect(stage.height).toBeGreaterThan(vp.height * 0.5);
  // 最初に押す「絵をかく」は見えている
  await expectInsideViewport(page, page.getByTestId("new-sketch"));
});

test("長方形をかいて立体にし、メニューと数字キーが画面の中に出る", async ({ page }) => {
  await drawRect(page);
  // 絵の道具は全部 押せる所にある(たて向きは2段、横向きは1段に入る)
  for (const tool of ["select", "line", "rect", "circle", "arc", "polygon", "text", "dimension"]) {
    await expectInsideViewport(page, page.getByTestId(`tool-${tool}`));
  }

  // 寸法の数字をタップすると数字キーが出る。OK まで画面の中にある
  await page.getByTestId("tool-dimension").tap();
  await page.getByTestId("dim-length").first().locator("text").first().tap();
  await expect(page.getByTestId("numpad-input")).toBeVisible();
  await expectInsideViewport(page, page.locator(".dialog.numpad"));
  await page.getByTestId("numpad-input").fill("40");
  await page.getByTestId("numpad-ok").tap();

  // 立体にするパネルの OK も画面の中
  await page.getByTestId("sketch-done").tap();
  await expectInsideViewport(page, page.getByTestId("op-ok"));
  await page.getByTestId("op-ok").tap();
  await expect(page.getByTestId("save-state")).not.toContainText("計算中", { timeout: 60_000 });

  // 次に押す「書き出す」は、手順バーが動いて見える所に来る
  await expect(page.getByTestId("open-export")).toHaveClass(/next/);
  await expect(async () => expectInsideViewport(page, page.getByTestId("open-export"))).toPass();

  // 書き出すメニューは画面の下に全部出る
  await page.getByTestId("open-export").tap();
  for (const id of ["export-stl", "export-3mf", "export-step"]) {
    await expectInsideViewport(page, page.getByTestId(id));
  }
  // メニューの外(3D)をタップすると とじる
  const stage = (await page.locator(".stage").boundingBox())!;
  await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height * 0.3);
  await expect(page.getByTestId("export-stl")).toHaveCount(0);

  // 手順バーを横にスクロールすると「ARで見る」まで届く
  await page.getByTestId("open-ar").scrollIntoViewIfNeeded();
  await expectInsideViewport(page, page.getByTestId("open-ar"));

  // 作業のれきしは、ボタンでひらく
  await page.getByTestId("tree-toggle").tap();
  await expect(page.getByTestId("feature-tree")).toBeVisible();
  await expectInsideViewport(page, page.getByTestId("feature-tree"));
});

test("図面の紙と、印刷のボタンに届く", async ({ page }) => {
  await drawRect(page);
  await page.getByTestId("sketch-done").tap();
  await page.getByTestId("op-ok").tap();
  await expect(page.getByTestId("save-state")).not.toContainText("計算中", { timeout: 60_000 });
  await page.getByTestId("open-drawing").scrollIntoViewIfNeeded();
  await page.getByTestId("open-drawing").tap();
  const paper = (await page.getByTestId("drawing-sheet").boundingBox())!;
  // 紙(灰色の所)が小さすぎない
  expect(paper.width * paper.height).toBeGreaterThan(page.viewportSize()!.width * page.viewportSize()!.height * 0.25);
  await page.getByTestId("drawing-print").scrollIntoViewIfNeeded();
  await expectInsideViewport(page, page.getByTestId("drawing-print"));
  await expectInsideViewport(page, page.getByTestId("drawing-close"));
});

// トップページ(2026-11-25)も、スマホで横にはみ出さず、大きなボタンが押せる所にある
test("トップページが横にはみ出さない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("top-page")).toBeVisible();
  const vp = page.viewportSize()!;
  const w = await page.getByTestId("top-page").evaluate((el) => el.scrollWidth);
  expect(w).toBeLessThanOrEqual(vp.width);
  await expectInsideViewport(page, page.getByTestId("top-open"));
});
