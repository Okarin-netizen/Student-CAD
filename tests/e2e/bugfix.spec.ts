// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 操作して見つけたバグの再発を防ぐテスト(2026-11-06)

import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
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

test("押し出しをなおしている間に Ctrl+Z を押しても、作業は消えない", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("feature-tree").locator("li").nth(1).locator(".tree-item").dblclick();
  await expect(page.getByTestId("op-ok")).toBeVisible();
  await page.keyboard.press("Control+z");
  await page.getByTestId("op-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);

  // 再生中の Ctrl+Z でも消えない
  await page.getByTestId("start-replay").click();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
});

test("0 になってしまう小さすぎる数は、数字キーパッドで入れられない", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("op-distance").click();
  await page.getByTestId("numpad-input").fill("0.0001");
  await expect(page.getByTestId("numpad-ok")).toBeDisabled();
  await page.getByTestId("numpad-input").fill("0.001");
  await expect(page.getByTestId("numpad-ok")).toBeEnabled();
});

test("円・多角形で同じ所を2回タップしても、大きさ0の形はできない", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  for (const tool of ["circle", "polygon"]) {
    await page.getByTestId(`tool-${tool}`).click();
    await tapCanvas(page, 0.5, 0.5);
    await tapCanvas(page, 0.5, 0.5);
    await expect(page.locator(".sk-region")).toHaveCount(0);
  }
  // そのあと少し離れた所をタップすれば、ふつうにかける
  await tapCanvas(page, 0.6, 0.5);
  await expect(page.locator(".sk-region")).toHaveCount(1);
});

test("作品の名前を空にすると、入力欄は元の名前にもどる", async ({ page }) => {
  await page.goto("/");
  const name = page.getByLabel("作品の名前");
  await name.fill("");
  await name.press("Enter");
  await expect(name).toHaveValue("新しい作品");
});

test("こわれた作品ファイルを開いても、画面は止まらない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.getByTestId("open-file-menu").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("file-open").click();
  await (await chooser).setFiles({
    name: "こわれた.scad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "student-cad", features: [{ id: "a", type: "sketch", name: "x" }] })),
  });
  await expect(page.getByTestId("toast")).toContainText("開けませんでした");
  expect(errors).toEqual([]);
});

test("点を動かしている途中で指の操作が取り消されたら、形をもとにもどす", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-line").click();
  await tapCanvas(page, 0.3, 0.5);
  await tapCanvas(page, 0.6, 0.5);
  await page.getByTestId("sketch-pending-stop").click();
  await page.getByTestId("tool-select").click();
  // 原点から見た、線のはしの高さ(画面の px)
  const height = () =>
    page.evaluate(() => {
      const axis = Number(document.querySelector(".sk-axis-x")!.getAttribute("y1"));
      return Math.round(Number(document.querySelector(".sk-canvas line[data-id]")!.getAttribute("y1")) - axis);
    });
  const before = await height();
  // 線のはしを指でつかんで下へ動かし、途中で取り消される(pointercancel)
  await page.evaluate(() => {
    const svg = document.querySelector("[data-testid=sketch-canvas]")!;
    const l = svg.querySelector("line[data-id]")!;
    const r = svg.getBoundingClientRect();
    const x = r.x + Number(l.getAttribute("x1"));
    const y = r.y + Number(l.getAttribute("y1"));
    // pointerId 1 は、ブラウザがいつも持っているポインター(setPointerCapture が使える)
    const fire = (type: string, dy: number) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: y + dy }));
    fire("pointerdown", 0);
    for (let k = 1; k <= 6; k++) fire("pointermove", k * 10);
  });
  await expect.poll(height).not.toBe(before);
  await page.evaluate(() =>
    document.querySelector("[data-testid=sketch-canvas]")!.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "touch" })),
  );
  await expect.poll(height).toBe(before);
});

/** 3D のまん中をたてに少しずつタップして、辺を1本えらぶ */
async function pickOneEdge(page: Page) {
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  for (let y = 0.9; y > 0.1; y -= 0.02) {
    await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * y);
    if ((await page.getByTestId("op-edges").textContent())?.includes("1 本")) break;
  }
  await expect(page.getByTestId("op-edges")).toContainText("1 本");
}

// 2026-11-13: 「できあがりを見る」→「ぜんぶはずす」のあと、辺をえらびなおせなくなっていた
test("角を丸める: できあがりを見たあと「ぜんぶはずす」を押しても、また辺をえらべる", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("new-fillet").click();
  await pickOneEdge(page);
  await page.getByTestId("op-preview").click();
  await page.getByRole("button", { name: "ぜんぶはずす" }).click();
  await expect(page.getByTestId("op-edges")).toContainText("タップ");
  // えらぶ画面にもどっているので、もう一度えらべる
  await pickOneEdge(page);
  await expect(page.getByTestId("op-preview")).toHaveText("できあがりを見る");
});

test("面取り: できあがりを見たあと「ぜんぶはずす」を押しても、また辺をえらべる", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("new-fillet").click();
  await page.getByTestId("op-chamfer").click();
  await pickOneEdge(page);
  await page.getByTestId("op-preview").click();
  await page.getByRole("button", { name: "ぜんぶはずす" }).click();
  await pickOneEdge(page);
});

test("くりぬく: できあがりを見たあと「ぜんぶはずす」を押しても、また面をえらべる", async ({ page }) => {
  await page.goto("/");
  await makeBox(page);
  await page.getByTestId("open-more").click();
  await page.getByTestId("new-shell").click();
  // 真上から見て、まん中(上の面)をタップする
  const cube = (await page.locator(".viewcube canvas").boundingBox())!;
  await page.mouse.click(cube.x + cube.width * 0.5, cube.y + cube.height * 0.2);
  await page.waitForTimeout(500);
  const view = (await page.getByTestId("viewer-3d").boundingBox())!;
  const tapTop = () => page.mouse.click(view.x + view.width * 0.5, view.y + view.height * 0.5);
  await tapTop();
  await expect(page.getByTestId("op-faces")).toContainText("1 こ");
  await page.getByTestId("op-preview").click();
  await page.getByRole("button", { name: "ぜんぶはずす" }).click();
  // くりぬく前の形の計算が終わるまでは、タップしても えらばない(2026-11-13 selection.spec.ts)
  await expect(page.getByTestId("save-state")).not.toHaveText("計算中…");
  await tapTop();
  await expect(page.getByTestId("op-faces")).toContainText("1 こ");
});
