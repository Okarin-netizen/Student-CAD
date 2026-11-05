// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test, type Page } from "@playwright/test";

// このテストだけは「はじめて開いた」状態にする
test.use({ storageState: { cookies: [], origins: [] } });

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("はじめて開くとガイドが出て、言われた通りにやると次へ進み、一度とじると出ない", async ({ page }) => {
  await page.goto("/");
  const guide = page.getByTestId("tutorial");
  await expect(guide).toContainText("ようこそ");
  await page.getByTestId("tutorial-next").click();
  await expect(guide).toContainText("1. 絵をかく");
  await page.getByTestId("new-sketch").click();
  await expect(guide).toContainText("2. かく面をえらぶ");
  await page.getByTestId("plane-top").click();
  await expect(guide).toContainText("3. 長方形をかく");
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.55);
  await tapCanvas(page, 0.6, 0.8);
  await expect(guide).toContainText("4. かけたら完成");
  await page.getByTestId("sketch-done").click();
  await expect(guide).toContainText("5. 立体にする");
  await page.getByTestId("op-ok").click();
  await expect(guide).toContainText("6. 角を丸める");
  await page.getByTestId("new-fillet").click();
  await expect(guide).toContainText("7. 丸める辺をえらぶ");

  await page.getByTestId("tutorial-close").click();
  await expect(guide).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("new-sketch")).toBeVisible();
  await expect(guide).toBeHidden();

  // ファイルのメニューから、いつでも見られる
  await page.getByTestId("open-file-menu").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("file-tutorial").click();
  await expect(guide).toContainText("ようこそ");
});
