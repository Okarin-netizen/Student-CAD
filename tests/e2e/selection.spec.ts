// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 「えらぶ」「もどす」「やめる」を組み合わせたときに、えらんだものや途中の操作が
// 残ってしまうバグの再発を防ぐテスト(2026-11-13)

import { expect, test, type Page } from "@playwright/test";

/** 画面で起きたエラーを集める(エラーが出たら、そこで操作が止まっている) */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** i 本目の線の上(t = 0 で始まり、1 で終わり)をタップする */
async function tapLine(page: Page, i: number, t = 0.5) {
  const r = (await page.getByTestId("sketch-canvas").boundingBox())!;
  const l = page.locator(".sk-canvas line[data-id]").nth(i);
  const [x1, y1, x2, y2] = await Promise.all(["x1", "y1", "x2", "y2"].map(async (a) => Number(await l.getAttribute(a))));
  await page.mouse.click(r.x + x1 + (x2 - x1) * t, r.y + y1 + (y2 - y1) * t);
}

/** 上の面に、折れ線を2本かく(線は続けて引ける状態のまま) */
async function drawTwoLines(page: Page) {
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.3, 0.5);
  await tapCanvas(page, 0.6, 0.5);
  await tapCanvas(page, 0.6, 0.3);
}

async function makeBox(page: Page) {
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
}

test("線を引いている途中で「もどす」を押しても、続けてかける", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await drawTwoLines(page);
  // もどすと、最後の線と、その終わりの点が消える。消えた点から線を引き続けてはいけない
  await page.getByTestId("undo").click();
  await expect(page.locator(".sk-canvas line[data-id]")).toHaveCount(1);
  await expect(page.locator(".sk-pending")).toHaveCount(0);
  await tapCanvas(page, 0.4, 0.3);
  await tapCanvas(page, 0.4, 0.2);
  await expect(page.locator(".sk-canvas line[data-id]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("寸法で点を1つえらんでから「もどす」を押しても、止まらない", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await drawTwoLines(page);
  await page.getByTestId("sketch-pending-stop").click();
  await page.getByTestId("tool-dimension").click();
  // 2本目の線の終わりの点をえらぶ(この点は、もどすと消える)
  await tapLine(page, 1, 1);
  await page.getByTestId("undo").click();
  // 1本目の線の始めの点をタップ。消えた点との距離を聞いてはいけない
  await tapLine(page, 0, 0);
  await expect(page.getByTestId("numpad-input")).toHaveCount(0);
  // 線をタップすれば、ふつうに長さを入れられる
  await tapLine(page, 0, 0.5);
  await expect(page.getByTestId("numpad-input")).toBeVisible();
  expect(errors).toEqual([]);
});

test("えらんだ線が「もどす」で消えたら、えらんでいないことにする", async ({ page }) => {
  await page.goto("/");
  await drawTwoLines(page);
  await page.getByTestId("sketch-pending-stop").click();
  await page.getByTestId("tool-select").click();
  await tapLine(page, 1);
  await expect(page.getByTestId("sk-delete")).toBeEnabled();
  await page.getByTestId("undo").click();
  await expect(page.locator(".sk-canvas line[data-id]")).toHaveCount(1);
  await expect(page.getByTestId("sk-delete")).toBeDisabled();
});

test("数字キーパッドが出ている間は、Ctrl+Z で作品が変わらない", async ({ page }) => {
  await page.goto("/");
  await drawTwoLines(page);
  await page.getByTestId("sketch-pending-stop").click();
  await page.getByTestId("tool-dimension").click();
  await tapLine(page, 0);
  await expect(page.getByTestId("numpad-input")).toBeVisible();
  // キーパッドのボタンにさわってから(入力欄の外で)Ctrl+Z
  await page.locator(".numpad button").first().focus();
  await page.keyboard.press("Control+z");
  await page.getByTestId("numpad-input").fill("40");
  await page.getByTestId("numpad-ok").click();
  await expect(page.locator(".sk-canvas line[data-id]")).toHaveCount(2);
  await expect(page.getByTestId("dim-length")).toHaveCount(1);
});

test("「辺をえらびなおす」の直後、計算が終わる前のタップでは、ちがう辺をえらばない", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("new-fillet").click();
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  let hitY = 0;
  for (let y = 0.9; y > 0.1; y -= 0.02) {
    await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * y);
    if ((await page.getByTestId("op-edges").textContent())?.includes("1 本")) {
      hitY = y;
      break;
    }
  }
  await expect(page.getByTestId("op-edges")).toContainText("1 本");
  await page.getByTestId("op-preview").click();
  await expect(page.getByTestId("save-state")).not.toHaveText("計算中…");
  // えらびなおすを押してすぐ、えらんだ辺をタップしてはずす
  await page.getByTestId("op-preview").click();
  await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * hitY);
  // 前の形(丸めたあと)の辺をえらんで「2 本」になってはいけない。
  // 計算中なら「計算しています」と出てタップは受けつけないので、待ってからもう一度タップする
  await expect(page.getByTestId("save-state")).not.toHaveText("計算中…");
  await expect(page.getByTestId("op-edges")).not.toContainText("2 本");
  if ((await page.getByTestId("op-edges").textContent())?.includes("1 本")) {
    await expect(page.getByTestId("toast")).toContainText("計算しています");
    await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * hitY);
  }
  await expect(page.getByTestId("op-edges")).toContainText("タップ");
});

test("面をずらす量は、パネルを閉じたら 0 にもどる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByRole("button", { name: "ずらす量を大きく" }).click();
  await expect(page.getByTestId("plane-offset")).toHaveText("5 mm");
  await page.getByRole("button", { name: "やめる" }).click();
  await page.getByTestId("new-sketch").click();
  await expect(page.getByTestId("plane-offset")).toHaveText("0 mm");
});

test("角を落とすに切りかえたら、れきしの名前も「角落とし」になる", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("new-fillet").click();
  await page.getByTestId("op-chamfer").click();
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  for (let y = 0.9; y > 0.1; y -= 0.02) {
    await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * y);
    if ((await page.getByTestId("op-edges").textContent())?.includes("1 本")) break;
  }
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree")).toContainText("角落とし1");
});

test("回すスケッチを変えたら、軸も新しいスケッチに合わせる", async ({ page }) => {
  await page.goto("/");
  // 1つ目: 補助線(回す軸)と長方形。かけたら「回す」が出るので、いったんやめる
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-front").click();
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.3, 0.3);
  await tapCanvas(page, 0.3, 0.7);
  await page.getByTestId("sketch-pending-stop").click();
  await page.getByTestId("tool-select").click();
  await tapLine(page, 0);
  await page.getByRole("button", { name: "補助線" }).click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.5, 0.4);
  await tapCanvas(page, 0.6, 0.6);
  await page.getByTestId("sketch-done").click();
  await page.getByRole("button", { name: "やめる" }).click();
  // 2つ目: たての軸(原点を通る緑の線)の右に長方形
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.6, 0.4);
  await tapCanvas(page, 0.7, 0.6);
  await page.getByTestId("sketch-done").click();
  await page.getByRole("button", { name: "やめる" }).click();

  // 1つ目のスケッチで回す(軸は補助線になる)→ 2つ目に変える
  await page.getByTestId("feature-tree").locator("li").first().locator(".tree-item").click();
  await page.getByTestId("new-revolve").click();
  const sketchSelect = page.getByTestId("op-sketch");
  const first = await sketchSelect.locator("option").first().getAttribute("value");
  await sketchSelect.selectOption(first!);
  await expect(page.getByTestId("op-axis")).toHaveValue(/^line:/);
  const second = await sketchSelect.locator("option").last().getAttribute("value");
  await sketchSelect.selectOption(second!);
  await expect(page.getByTestId("op-axis")).toHaveValue("y");
  await expect(page.getByTestId("op-error")).toHaveCount(0);
  await expect(page.getByTestId("op-ok")).toBeEnabled();
});

test("図面: 寸法を消してまた出したら、えらびかけの点は残らない", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("open-drawing").click();
  const sheet = page.getByTestId("drawing-sheet");
  await page.getByTestId("dim-add").click();
  await sheet.locator(".snap-dot").nth(0).click({ force: true });
  await expect(sheet.locator(".snap-picked")).toBeAttached();
  await page.getByTestId("drawing-dims").uncheck();
  await page.getByTestId("drawing-dims").check();
  await expect(sheet.locator(".snap-picked")).toHaveCount(0);
  await expect(sheet.locator(".snap-dot")).toHaveCount(0);
});
