// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// トップページ(2026-11-25 追加)。URL を開くと まずトップページが出て、
// 「つづきから」「新しく作る」「ファイルをひらく」「せつめい書」から始められるかを確かめる。

import { expect, test } from "@playwright/test";
import { emptyDocument } from "../../src/doc/types";

test("はじめて開くとトップページが出て、白紙から作業画面に入れる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("top-page")).toBeVisible();
  // まだ作品がないので「つづきから」のかわりに案内が出る
  await expect(page.getByTestId("top-empty")).toBeVisible();
  await expect(page.getByTestId("top-continue")).toHaveCount(0);
  // 作品がないときは「白紙」がみどり(次に押すボタン)
  await expect(page.getByTestId("top-template-blank")).toHaveClass(/primary/);

  await page.getByTestId("top-template-blank").click();
  await expect(page.getByTestId("top-page")).toHaveCount(0);
  await expect(page.getByTestId("new-sketch")).toBeVisible();
});

test("ひな形で始めた作品は、開き直すと「つづきから」で続けられる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("top-template-nameplate").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("save-state")).toHaveText("保存ずみ");

  await page.reload();
  const cont = page.getByTestId("top-continue");
  await expect(cont).toContainText("名札");
  await expect(cont).toContainText("作業 2 こ");
  await expect(cont).toHaveClass(/primary/);
  // 作品があるときは、新しく作ると閉じることを先に知らせる
  await expect(page.locator(".top-note")).toContainText("名札");

  await cont.click();
  await expect(page.getByTestId("top-page")).toHaveCount(0);
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
});

test("作業画面の「ファイル」からトップページにもどり、新しく作るときは確かめる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("top-template-nameplate").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);

  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-top").click();
  await expect(page.getByTestId("top-page")).toBeVisible();

  // 白紙をえらぶと、いまの作品を閉じてよいか聞く。「やめる」なら何も変わらない
  await page.getByTestId("top-template-blank").click();
  const ask = page.getByRole("dialog", { name: "新しく作る確認" });
  await expect(ask).toBeVisible();
  await page.getByTestId("new-cancel").click();
  await expect(page.getByTestId("top-continue")).toContainText("作業 2 こ");

  // 「新しく作る」なら白紙で始まる
  await page.getByTestId("top-template-blank").click();
  await page.getByTestId("new-ok").click();
  await expect(page.getByTestId("top-page")).toHaveCount(0);
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(0);
});

test("トップページの「ファイルをひらく」で作品ファイルを開ける", async ({ page }) => {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("top-open").click();
  await (await chooser).setFiles({
    name: "ぼくの作品.scad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...emptyDocument(), name: "ぼくの作品" })),
  });
  await expect(page.getByTestId("top-page")).toHaveCount(0);
  await expect(page.getByLabel("作品の名前")).toHaveValue("ぼくの作品");
});

test("せつめい書(PDF)が開ける・このアプリについてが出る", async ({ page }) => {
  await page.goto("/");
  const href = await page.getByTestId("top-manual").getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");

  await page.getByTestId("top-about").click();
  await expect(page.getByTestId("about-dialog")).toBeVisible();
  await page.getByTestId("about-close").click();
  await expect(page.getByTestId("top-page")).toBeVisible();
});

test("?cad をつけると、トップページをとばして作業画面から始まる", async ({ page }) => {
  await page.goto("/?cad");
  await expect(page.getByTestId("new-sketch")).toBeVisible();
  await expect(page.getByTestId("top-page")).toHaveCount(0);
});
