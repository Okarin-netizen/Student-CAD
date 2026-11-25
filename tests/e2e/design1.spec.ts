// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// デザインの改善 段階1(2026-11-21): 読める・そろう・Esc でとじる

import { expect, test } from "@playwright/test";

test("まだ押せないボタンも、うすくせず読める濃さで出す(点線のわく)", async ({ page }) => {
  await page.goto("/?cad");
  for (const id of ["new-extrude", "undo"]) {
    const look = await page.getByTestId(id).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { opacity: cs.opacity, border: cs.borderTopStyle, color: cs.color };
    });
    expect(look.opacity).toBe("1");
    expect(look.border).toBe("dashed");
    expect(look.color).toBe("rgb(91, 105, 99)");
  }
});

test("Esc で、いちばん上の画面だけが とじる", async ({ page }) => {
  await page.goto("/?cad");
  await page.getByTestId("new-sketch").click();
  await expect(page.getByTestId("plane-top")).toBeVisible();
  // 面をずらす数字キーパッドの上で Esc → キーパッドだけ とじる
  await page.getByTestId("plane-offset").click();
  await expect(page.getByTestId("numpad-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("numpad-input")).toHaveCount(0);
  await expect(page.getByTestId("plane-top")).toBeVisible();
  // もう一度 Esc → 面をえらぶパネルも とじる
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("plane-top")).toHaveCount(0);
});
