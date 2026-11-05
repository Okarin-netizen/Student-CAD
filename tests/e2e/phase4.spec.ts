// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function circleSketch(page: Page, offset: number) {
  await page.getByTestId("new-sketch").click();
  if (offset > 0) {
    await page.getByTestId("plane-offset").click();
    await page.getByTestId("numpad-input").fill(String(offset));
    await page.getByTestId("numpad-ok").click();
  }
  await expect(page.getByTestId("plane-top")).toContainText(offset > 0 ? `から ${offset}mm` : "上の面");
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.5, 0.5);
  await tapCanvas(page, offset > 0 ? 0.53 : 0.58, 0.5);
  await page.getByTestId("sketch-done").click();
}

test("ずらした面にかいた形と、下の形をつなぐ(ロフト)", async ({ page }) => {
  await page.goto("/");
  await circleSketch(page, 0);
  // 1つ目は押し出しがすすめられるが、つなぐので やめる
  await page.getByRole("dialog", { name: "立体にする" }).getByRole("button", { name: "やめる" }).click();
  await circleSketch(page, 40);
  // ずらした面にかくと、自動で「つなぐ」になり、2つのスケッチがえらばれている
  const panel = page.getByRole("dialog", { name: "つなぐ" });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("op-loft-sketches").locator("button.active")).toHaveCount(2);
  await expect(page.getByTestId("op-ok")).toBeEnabled();
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(3);
  await expect(tree).toContainText("スケッチ1 → スケッチ2");
  await expect(tree.locator("li.bad")).toHaveCount(0);
});

test("箱の上の面をタップして、くりぬく(シェル)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.3);
  await tapCanvas(page, 0.7, 0.7);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-distance").click();
  await page.getByTestId("numpad-input").fill("40");
  await page.getByTestId("numpad-ok").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);

  await page.getByTestId("open-more").click();
  await page.getByTestId("new-shell").click();
  await expect(page.getByTestId("op-ok")).toBeDisabled();
  // 真上から見て、まん中(上の面)をタップする
  const cube = (await page.locator(".viewcube canvas").boundingBox())!;
  await page.mouse.click(cube.x + cube.width * 0.5, cube.y + cube.height * 0.2);
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  await page.waitForTimeout(500);
  await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * 0.5);
  await expect(page.getByTestId("op-faces")).toContainText("取りのぞく面: 1 こ");
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(3);
  await expect(tree).toContainText("あつさ 2mm ・ 面 1 こ");
  await expect(tree.locator("li.bad")).toHaveCount(0);
});

test("線をかいて道すじにし、断面の円をそれにそって動かす(スイープ)", async ({ page }) => {
  await page.goto("/");
  // 道すじ: 上の面に、折れ線(閉じていない線)
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.3, 0.6);
  await tapCanvas(page, 0.5, 0.6);
  await tapCanvas(page, 0.6, 0.4);
  await page.getByTestId("sketch-done").click();
  await expect(page.getByTestId("toast")).toContainText("道すじ");
  // 断面: 右の面に円
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-right").click();
  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.5, 0.5);
  await tapCanvas(page, 0.52, 0.5);
  await page.getByTestId("sketch-done").click();
  // 道すじがあるので、自動で「なぞる」になる
  await expect(page.getByRole("dialog", { name: "なぞる" })).toBeVisible();
  await expect(page.getByTestId("op-path")).toHaveValue(/.+/);
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(3);
  await expect(tree).toContainText("スケッチ2 を スケッチ1 にそって");
  await expect(tree.locator("li.bad")).toHaveCount(0);
});
