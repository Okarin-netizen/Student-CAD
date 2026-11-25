// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// プログラマ目線の点検で見つけたバグの再発を防ぐテスト(2026-11-22)

import { expect, test, type Page } from "@playwright/test";

/** 3D の画面のまん中で、ポインターの出来事(down / up / cancel)を順に起こす */
async function pointerSequence(page: Page, steps: { type: "pointerdown" | "pointerup" | "pointercancel"; id: number; primary: boolean }[]) {
  await page.evaluate((list) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".stage-3d canvas")!;
    const r = canvas.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const s of list) {
      canvas.dispatchEvent(new PointerEvent(s.type, { pointerId: s.id, isPrimary: s.primary, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    }
  }, steps);
}

test("面をえらぶ画面で2本指でさわっても、平面をえらんだことにしない", async ({ page }) => {
  await page.goto("/?cad");
  await page.getByTestId("new-sketch").click();
  await expect(page.locator(".app")).toHaveClass(/mode-pickPlane/);

  // 2本指(ズーム)。指をはなしてもタップにはならない
  await pointerSequence(page, [
    { type: "pointerdown", id: 11, primary: true },
    { type: "pointerdown", id: 12, primary: false },
    { type: "pointerup", id: 11, primary: true },
    { type: "pointerup", id: 12, primary: false },
  ]);
  // OS がとり消したタッチも、タップにはならない
  await pointerSequence(page, [
    { type: "pointerdown", id: 13, primary: true },
    { type: "pointercancel", id: 13, primary: true },
    { type: "pointerup", id: 13, primary: true },
  ]);
  await page.waitForTimeout(300);
  await expect(page.locator(".app")).toHaveClass(/mode-pickPlane/);

  // 1本指のタップは、これまでどおり平面をえらぶ
  await pointerSequence(page, [
    { type: "pointerdown", id: 14, primary: true },
    { type: "pointerup", id: 14, primary: true },
  ]);
  await expect(page.getByTestId("sketch-canvas")).toBeVisible();
});
