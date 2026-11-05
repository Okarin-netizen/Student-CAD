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

test("補助線を軸にして回すと、回転の立体ができる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-front").click();
  // 原点を通るたての補助線(軸)と、その右に長方形
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.2, 0.9);
  await tapCanvas(page, 0.2, 0.1);
  await page.getByText("ここで終わる").click();
  await page.getByTestId("tool-select").click();
  await tapCanvas(page, 0.2, 0.5);
  await page.getByRole("button", { name: "補助線" }).click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.3);
  await tapCanvas(page, 0.6, 0.7);
  await page.getByTestId("sketch-done").click();

  // 補助線があるので、回転のパネルが開く
  await expect(page.getByTestId("op-angle")).toHaveText("360 °");
  await expect(page.getByTestId("op-axis")).toHaveValue(/^line:/);
  await expect(page.getByTestId("op-ok")).toBeEnabled();
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(2);
  await expect(tree).toContainText("360°");
  await expect(tree.locator("li.bad")).toHaveCount(0);
  await expect(page.getByTestId("export-step")).toBeEnabled();
});

test("辺をタップして角を丸め、STEP で書き出せる", async ({ page }) => {
  await makeBox(page);
  await page.getByTestId("new-fillet").click();
  await expect(page.getByTestId("op-edges")).toContainText("タップ");

  // 3D のまん中をたてに少しずつタップして、辺を1本えらぶ
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  for (let y = 0.9; y > 0.1; y -= 0.02) {
    await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * y);
    if ((await page.getByTestId("op-edges").textContent())?.includes("1 本")) break;
  }
  await expect(page.getByTestId("op-edges")).toContainText("1 本");

  await page.getByTestId("op-preview").click();
  await expect(page.getByTestId("op-ok")).toBeEnabled();
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(3);
  await expect(tree).toContainText("R2");
  await expect(tree.locator("li.bad")).toHaveCount(0);

  const download = page.waitForEvent("download");
  await page.getByTestId("export-step").click();
  expect((await download).suggestedFilename()).toMatch(/\.step$/);
});
