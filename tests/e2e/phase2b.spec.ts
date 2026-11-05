// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** 上の面に長方形をかいて押し出し、板を作る */
async function makePlate(page: Page) {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.35);
  await tapCanvas(page, 0.7, 0.65);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
}

test("文字ツールで名前を入れ、押し出して名札にできる", async ({ page }) => {
  await makePlate(page);
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-text").click();
  await tapCanvas(page, 0.35, 0.55);
  await page.getByTestId("text-input").fill("ぎじゅつ");
  await page.getByTestId("text-size-8").click();
  await page.getByTestId("text-ok").click();
  await expect(page.getByTestId("sketch-text")).toHaveText("ぎじゅつ");

  // 文字をタップしてえらび、なおす
  await page.getByTestId("tool-select").click();
  const t = (await page.getByTestId("sketch-text").boundingBox())!;
  await page.mouse.click(t.x + t.width / 2, t.y + t.height / 2);
  await page.getByTestId("text-edit").click();
  await page.getByTestId("text-input").fill("技術 A1");
  await page.getByTestId("text-ok").click();
  await expect(page.getByTestId("sketch-text")).toHaveText("技術 A1");

  // 文字だけのスケッチでも、終えると押し出しが開く
  await page.getByTestId("sketch-done").click();
  await expect(page.getByTestId("op-distance")).toBeVisible();
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(4);
  await expect(tree.locator("li.bad")).toHaveCount(0);
});

test("立体を対称にし、穴をならべられる", async ({ page }) => {
  await makePlate(page);
  await page.getByTestId("new-mirror").click();
  await expect(page.getByTestId("op-source")).toHaveValue("body");
  await page.getByTestId("op-plane-front").click();
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(3);
  await expect(tree).toContainText("立体ぜんぶ");

  // 小さな円をかいて穴にし、それをならべる
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.45, 0.45);
  await tapCanvas(page, 0.47, 0.45);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-cut").click();
  await page.getByTestId("op-ok").click();
  await expect(tree.locator("li")).toHaveCount(5);

  await page.getByTestId("new-pattern").click();
  await page.getByTestId("op-count").click();
  await page.getByTestId("numpad-input").fill("4");
  await page.getByTestId("numpad-ok").click();
  await page.getByTestId("op-second").check();
  await expect(page.getByTestId("op-ok")).toBeEnabled();
  await page.getByTestId("op-ok").click();
  await expect(tree.locator("li")).toHaveCount(6);
  await expect(tree).toContainText("4×2 こ");
  await expect(tree.locator("li.bad")).toHaveCount(0);
});

test("変数を作って寸法とあつさに使い、変数を変えると形が変わる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-variables").click();
  await page.getByTestId("var-add").click();
  const name = page.getByTestId("var-name-数1");
  await name.fill("幅");
  await name.press("Enter");
  await page.getByTestId("var-value-幅").click();
  await page.getByTestId("numpad-input").fill("40");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("var-value-幅")).toContainText("40");
  await page.getByTestId("var-close").click();

  // 長方形の下の辺に「幅」を使う
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("tool-dimension").click();
  await tapCanvas(page, 0.5, 0.65);
  await page.getByTestId("numpad-var-幅").click();
  await expect(page.getByTestId("numpad-result")).toContainText("40");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("dim-length")).toContainText("幅=40");

  // あつさは 幅/4
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-distance").click();
  await page.getByTestId("numpad-input").fill("幅/4");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("op-distance")).toHaveText("幅/4 = 10 mm");
  await page.getByTestId("op-ok").click();
  const tree = page.getByTestId("feature-tree");
  await expect(tree).toContainText("10mm");

  // 幅を 60 にすると、あつさも 15 になる
  await page.getByTestId("open-variables").click();
  await page.getByTestId("var-value-幅").click();
  await page.getByTestId("numpad-input").fill("60");
  await page.getByTestId("numpad-ok").click();
  await page.getByTestId("var-close").click();
  await expect(tree).toContainText("15mm");
  await expect(tree.locator("li.bad")).toHaveCount(0);
});

test("面からはみ出す大きな文字は、面に入る大きさになる", async ({ page }) => {
  await makePlate(page);
  // 板の上の面をタップして、その面にかく
  await page.getByTestId("new-sketch").click();
  const v = (await page.getByTestId("viewer-3d").boundingBox())!;
  await page.mouse.click(v.x + v.width * 0.5, v.y + v.height * 0.5);
  await expect(page.getByTestId("sketch-references")).toBeVisible();
  await page.getByTestId("tool-text").click();
  await tapCanvas(page, 0.45, 0.5);
  await page.getByTestId("text-input").fill("とても長い名前の名札です");
  await page.getByTestId("text-size-30").click();
  await page.getByTestId("text-ok").click();
  await expect(page.getByTestId("toast")).toContainText("文字の大きさ");
  await expect(page.getByTestId("text-overflow")).toHaveCount(0);
});
