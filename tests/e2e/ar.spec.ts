// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 「ARで見る」(2026-11-20 追加)。
// テストの Chromium にはカメラの AR がないので、
//   ・使えない端末の案内が出ること
//   ・iPad のふりをさせたとき、AR クイックルック用のファイル(USDZ)を開こうとすること
// を確かめる。

import { expect, test, type Page } from "@playwright/test";

async function startNameplate(page: Page) {
  await page.goto("/");
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-new").click();
  await page.getByTestId("template-nameplate").click();
  await expect(page.getByTestId("save-state")).not.toHaveText("計算中…");
}

test("カメラも使えない端末では、使える端末を案内する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined });
  });
  await startNameplate(page);
  await page.getByTestId("open-ar").click();
  const dialog = page.getByTestId("ar-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("ar-unsupported")).toContainText("この端末では AR が使えません");
  await expect(page.getByTestId("ar-unsupported")).toContainText("iPad");
  // 実物大で出すことと、その大きさ
  await expect(page.getByTestId("ar-size")).toContainText("はば 60mm");
  await expect(page.getByTestId("ar-start")).toHaveCount(0);
  await page.getByTestId("ar-close").click();
  await expect(dialog).toHaveCount(0);
});

test("iPad では、AR クイックルックで USDZ を開く", async ({ page }) => {
  // <a rel="ar"> がわかるブラウザ(iPad の Safari)のふりをして、開こうとしたファイルを記録する
  await page.addInitScript(() => {
    const supports = DOMTokenList.prototype.supports;
    DOMTokenList.prototype.supports = function (token: string) {
      return token === "ar" ? true : supports.call(this, token);
    };
    HTMLAnchorElement.prototype.click = function () {
      const w = window as unknown as { __ar?: unknown };
      w.__ar = { rel: this.rel, href: this.href, img: !!this.querySelector("img") };
    };
  });
  await startNameplate(page);
  await page.getByTestId("open-ar").click();
  const start = page.getByTestId("ar-start");
  await expect(start).toBeEnabled();
  await expect(start).toHaveText(/カメラで見る/);
  await start.click();

  const opened = await page.evaluate(async () => {
    const ar = (window as unknown as { __ar: { rel: string; href: string; img: boolean } }).__ar;
    const res = await fetch(ar.href);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { hash: new URL(ar.href).hash, rel: ar.rel, img: ar.img, type: res.headers.get("content-type"), head: String.fromCharCode(bytes[0], bytes[1]), size: bytes.length };
  });
  expect(opened.rel).toBe("ar");
  // 指で大きさを変えられない(いつも実物大)
  expect(opened.hash).toBe("#allowsContentScaling=0");
  expect(opened.img).toBe(true);
  expect(opened.type).toBe("model/vnd.usdz+zip");
  // USDZ は ZIP の形(はじめが PK)
  expect(opened.head).toBe("PK");
  expect(opened.size).toBeGreaterThan(1000);
});

test("Android では WebXR の手順が出て、カメラを開けなかったときは知らせる", async ({ page }) => {
  // WebXR の AR がある(が、カメラは許可されなかった)ふりをする
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      value: {
        isSessionSupported: async (mode: string) => mode === "immersive-ar",
        requestSession: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
    });
  });
  await startNameplate(page);
  await page.getByTestId("open-ar").click();
  await expect(page.getByTestId("ar-dialog")).toContainText("みどりの輪");
  await page.getByTestId("ar-start").click();
  await expect(page.getByTestId("toast")).toContainText("カメラを開けませんでした");
  // AR 画面の文字・ボタンは出ていない
  await expect(page.locator(".ar-overlay")).toBeHidden();
});
