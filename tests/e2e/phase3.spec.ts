// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function startTemplate(page: Page, id: string) {
  await page.goto("/");
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-new").click();
  await page.getByTestId(`template-${id}`).click();
}

test("課題のひな形から始めると、課題カードに条件ができたかどうかが出る", async ({ page }) => {
  await startTemplate(page, "nameplate");
  const card = page.getByTestId("assignment-card");
  await expect(card).toContainText("名札を作ろう");
  // 板は用意してあるので、大きさの2つはもうできている
  await expect(page.getByTestId("assignment-count")).toHaveText("2 / 4");
  await expect(card).toContainText("いまは 60 mm");
  // たたむと小さくなる
  await page.getByTestId("assignment-toggle").click();
  await expect(page.getByTestId("assignment-checks")).toBeHidden();
});

test("作り方を再生すると、1つずつ形ができていく", async ({ page }) => {
  await startTemplate(page, "nameplate");
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
  await page.getByTestId("start-replay").click();
  await expect(page.getByTestId("replaybar")).toBeVisible();
  await expect(page.getByTestId("replay-label")).toContainText("1 / 2");
  // 自動で次へ進み、最後で止まる
  await expect(page.getByTestId("replay-label")).toContainText("2 / 2 ・ 板", { timeout: 8000 });
  await expect(page.getByTestId("replay-play")).toContainText("もう一度");
  await page.getByTestId("replay-prev").click();
  await expect(page.getByTestId("replay-label")).toContainText("1 / 2");
  await page.getByTestId("replay-close").click();
  await expect(page.getByTestId("new-sketch")).toBeVisible();
});

test("提出用ファイルは 組-番号_名前_作品名.zip で、名前は次から覚えている", async ({ page }) => {
  await startTemplate(page, "nameplate");
  await expect(page.getByTestId("assignment-count")).toHaveText("2 / 4");
  await page.getByTestId("open-submit").click();
  await expect(page.getByTestId("submit-ok")).toBeDisabled();
  // まだできていない条件を知らせる
  await expect(page.getByTestId("submit-not-yet")).toContainText("「文字」を使う");
  await page.getByTestId("submit-class").fill("2-3");
  await page.getByTestId("submit-number").fill("7");
  await page.getByTestId("submit-name").fill("技術 花子");
  const download = page.waitForEvent("download");
  await page.getByTestId("submit-ok").click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("2-3-07_技術_花子_名札.zip");
  const bytes = readFileSync((await d.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.toString("utf8")).toContain("提出カード.html");

  await page.getByTestId("open-submit").click();
  await expect(page.getByTestId("submit-name")).toHaveValue("技術 花子");
});

test("先生が課題を作って課題ファイルに保存し、開くと課題カードが出る", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-assignment").click();
  await page.getByTestId("assignment-title").fill("ふでばこを作ろう");
  await page.getByTestId("assignment-instructions").fill("はば 200mm 以下で作ります");
  await page.getByTestId("add-size-check").click();
  await page.getByTestId("assignment-check-list").getByLabel("いくつ以下").fill("200");
  const download = page.waitForEvent("download");
  await page.getByTestId("assignment-export").click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("課題_ふでばこを作ろう.scad.json");
  const saved = JSON.parse(readFileSync((await d.path())!, "utf8"));
  expect(saved.assignment.checks[0]).toMatchObject({ kind: "size", axis: "x", max: 200 });
  expect(saved.meta).toBeUndefined();
  await expect(page.getByTestId("assignment-card")).toContainText("はばが 200 mm 以下");
});
