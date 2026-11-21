// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 操作して見つけたバグの再発を防ぐテスト その2(2026-11-21)

import { expect, test, type Page } from "@playwright/test";
import { emptyDocument } from "../../src/doc/types";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function makeBox(page: Page) {
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
}

async function openFile(page: Page, name: string) {
  await page.getByTestId("open-file-menu").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("file-open").click();
  await (await chooser).setFiles({
    name: `${name}.scad.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...emptyDocument(), name })),
  });
}

test("作業があるときにファイルを開くと、いまの作品を閉じてよいか聞く", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await openFile(page, "べつの作品");
  const ask = page.getByRole("dialog", { name: "ファイルをひらく確認" });
  await expect(ask).toContainText("「べつの作品」を開きますか?");
  // やめると、いまの作品のまま
  await page.getByTestId("open-cancel").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
  // ひらくと入れかわる
  await openFile(page, "べつの作品");
  await page.getByTestId("open-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("「べつの作品」を開きました");
});

test("かいてある絵をなおすときは「えらぶ」から始まり、やめるときは なおしたところだけ捨てると出る", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("feature-tree").locator("li").nth(0).locator(".tree-item").dblclick();
  await expect(page.getByTestId("tool-select")).toHaveClass(/active/);
  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.5, 0.5);
  await tapCanvas(page, 0.53, 0.5);
  await page.getByTestId("sketch-cancel").click();
  const ask = page.getByRole("dialog", { name: "かいた絵を捨てる確認" });
  await expect(ask).toContainText("なおしたところを捨てますか?");
  await expect(ask).toContainText("前の絵はそのまま残ります");
  await page.getByTestId("discard-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
});

test("ふだんの言葉のときは、案内に「スケッチ」と出さない", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("open-more").click();
  await page.getByTestId("new-loft").click();
  await expect(page.getByTestId("toast")).toContainText("絵が2つ以上");
  await expect(page.getByTestId("toast")).not.toContainText("スケッチ");
});

test("縦向きでは、3D の操作の説明が「作業のれきし」ボタンと重ならない", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  const howto = (await page.getByTestId("howto-3d").boundingBox())!;
  const toggle = (await page.getByTestId("tree-toggle").boundingBox())!;
  const overlap = howto.x < toggle.x + toggle.width && toggle.x < howto.x + howto.width && howto.y < toggle.y + toggle.height && toggle.y < howto.y + howto.height;
  expect(overlap).toBe(false);
});
