import { expect, test, type Page } from "@playwright/test";

async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("長方形をかいて寸法を入れ、押し出して STL を書き出せる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.getByTestId("new-sketch")).toBeVisible();

  // 1. 上の面にスケッチ
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await expect(page.getByTestId("sketch-canvas")).toBeVisible();

  // 長方形を2回のタップで
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.35, 0.35);
  await tapCanvas(page, 0.65, 0.65);
  await expect(page.locator(".sk-region")).toHaveCount(1);

  // 下の辺に長さ 50mm
  await page.getByTestId("tool-dimension").click();
  await tapCanvas(page, 0.5, 0.65);
  await page.getByTestId("dim-length").click();
  await page.getByTestId("numpad-input").fill("100/2");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("dim-length")).toContainText("50");

  // もどす → やりなおす
  await page.getByTestId("undo").click();
  await expect(page.locator('[data-testid="dim-length"]')).toHaveCount(0);
  await page.getByTestId("redo").click();
  await expect(page.locator("g[data-testid=dim-length]")).toContainText("50");

  // 2. スケッチを終えると、押し出しのパネルが開く
  await page.getByTestId("sketch-done").click();
  await expect(page.getByTestId("extrude-distance")).toHaveText("10 mm");
  await page.getByTestId("extrude-distance").click();
  await page.getByTestId("numpad-input").fill("8");
  await page.getByTestId("numpad-ok").click();
  await expect(page.getByTestId("extrude-ok")).toBeEnabled();
  await page.getByTestId("extrude-ok").click();

  const tree = page.getByTestId("feature-tree");
  await expect(tree.locator("li")).toHaveCount(2);
  await expect(tree).toContainText("8mm");

  // 3. STL を書き出す
  await expect(page.getByTestId("export-stl")).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-stl").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.stl$/);

  // 自動保存されていて、読み込み直しても残っている
  await expect(page.getByTestId("save-state")).toContainText("保存ずみ");
  await page.reload();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);

  expect(errors).toEqual([]);
});

test("円をかいて、直径を入れて、平らな面にけずる穴をあけられる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-rect").click();
  await tapCanvas(page, 0.3, 0.3);
  await tapCanvas(page, 0.7, 0.7);
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("extrude-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);

  // 2つ目のスケッチに円をかいて、けずる
  await page.getByTestId("new-sketch").click();
  await page.getByTestId("plane-top").click();
  await page.getByTestId("tool-circle").click();
  await tapCanvas(page, 0.5, 0.5);
  await tapCanvas(page, 0.55, 0.5);
  await page.getByTestId("tool-dimension").click();
  await tapCanvas(page, 0.55, 0.5);
  await page.getByTestId("numpad-input").fill("6");
  await page.getByTestId("numpad-ok").click();
  await expect(page.locator("g[data-testid=dim-diameter]")).toContainText("6");
  await page.getByTestId("sketch-done").click();
  await page.getByTestId("extrude-cut").click();
  await expect(page.getByTestId("extrude-ok")).toBeEnabled();
  await page.getByTestId("extrude-ok").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("feature-tree").locator("li.bad")).toHaveCount(0);

  // スケッチを消すと、それを使う押し出しも消える
  await page.getByTestId("feature-tree").locator("li").nth(2).locator(".tree-item").click();
  await page.getByTestId("tree-delete").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(2);
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("feature-tree").locator("li")).toHaveCount(4);
});

test("指のタップでも長方形をかける", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "タッチ画面の端末だけ");
  await page.goto("/");
  await page.getByTestId("new-sketch").tap();
  await page.getByTestId("plane-front").tap();
  await page.getByTestId("tool-rect").tap();
  const box = (await page.getByTestId("sketch-canvas").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(page.locator(".sk-region")).toHaveCount(1);
  await page.getByTestId("sketch-done").tap();
  await expect(page.getByTestId("extrude-ok")).toBeEnabled();
});
