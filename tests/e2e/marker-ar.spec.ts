// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// マーカーAR(Chromebook・パソコン向け。2026-11-20 追加)。
// Chromium の「にせのカメラ」に、印刷したマーカーをうつした絵を流して、立体が乗ることを確かめる。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * マーカー(ARUCO_MIP_36h12 の 0 番)のマス目。true が白。
 * アプリの markerSheet.ts と同じものを、テストの中で js-aruco2 から作る(?raw の読みこみが Node では使えないため)
 */
function markerCells(): boolean[][] {
  const scope: { AR?: { Dictionary: new (n: string) => { codeList: string[] } } } = {};
  for (const f of ["cv.js", "aruco.js"]) new Function("require", readFileSync(join("node_modules/js-aruco2/src", f), "utf8")).call(scope, () => undefined);
  const code = new scope.AR!.Dictionary("ARUCO_MIP_36h12").codeList[0];
  const inner = Math.round(Math.sqrt(code.length));
  const n = inner + 2;
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => x > 0 && y > 0 && x < n - 1 && y < n - 1 && code[(y - 1) * inner + (x - 1)] === "1"),
  );
}

const W = 640;
const H = 480;

/** マーカーをうつした絵(1 コマ)の Y4M 動画を作る。Chromium はこれをくり返してカメラの映像にする */
function writeMarkerVideo(): string {
  const cells = markerCells();
  const side = 240;
  const unit = side / cells.length;
  const x0 = (W - side) / 2;
  const y0 = (H - side) / 2;
  const luma = Buffer.alloc(W * H, 235);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cx = Math.floor((x - x0) / unit);
      const cy = Math.floor((y - y0) / unit);
      if (cx >= 0 && cy >= 0 && cx < cells.length && cy < cells.length && !cells[cy][cx]) luma[y * W + x] = 16;
    }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const dir = join("test-results", "fixtures");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "marker.y4m");
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), luma, chroma, chroma]));
  return file;
}

const video = writeMarkerVideo();
test.use({
  permissions: ["camera"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  },
});

async function startNameplate(page: Page) {
  await page.goto("/");
  await page.getByTestId("open-file-menu").click();
  await page.getByTestId("file-new").click();
  await page.getByTestId("template-nameplate").click();
  await expect(page.getByTestId("save-state")).not.toHaveText("計算中…");
}

test("Chromebook では、印刷したマーカーをカメラにうつすと立体が乗る", async ({ page }) => {
  await startNameplate(page);
  await page.getByTestId("open-ar").click();
  await expect(page.getByTestId("ar-marker-intro")).toContainText("印刷したマーカー");
  await expect(page.getByTestId("ar-print-marker")).toBeVisible();
  await page.getByTestId("ar-start").click();

  const view = page.getByTestId("marker-ar");
  await expect(view).toBeVisible();
  await expect(page.getByTestId("marker-status")).toContainText("立体が乗りました", { timeout: 20_000 });
  // パソコンのカメラ(向きが分からない)は前のカメラとして、鏡のように見せる
  await expect(view.locator(".marker-stage")).toHaveClass(/mirrored/);
  // 立体をかくキャンバスが、映像の上に重なっている
  await expect(view.locator(".marker-stage canvas")).toHaveCount(1);

  await page.getByTestId("marker-close").click();
  await expect(view).toHaveCount(0);
  // カメラは止まっている
  const live = await page.evaluate(() => document.querySelectorAll("video").length);
  expect(live).toBe(0);
});

test("マーカーがうつっていないときは、うつし方を案内する", async ({ page }) => {
  await page.addInitScript(() => {
    // 真っ白な映像にする
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      await orig(c).then((s) => s.getTracks().forEach((t) => t.stop()));
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const paint = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 640, 480);
      };
      paint();
      setInterval(paint, 100);
      return canvas.captureStream(10);
    };
  });
  await startNameplate(page);
  await page.getByTestId("open-ar").click();
  await page.getByTestId("ar-start").click();
  await expect(page.getByTestId("marker-status")).toContainText("マーカーを", { timeout: 20_000 });
  await expect(page.getByTestId("marker-status")).not.toContainText("立体が乗りました");
});
