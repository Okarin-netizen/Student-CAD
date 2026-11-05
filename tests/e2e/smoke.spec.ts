import { expect, test } from "@playwright/test";

test("起動して、寸法を変えると形が追従し、STL を書き出せる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  await expect(page.getByTestId("last-timings")).toContainText("三角形");

  // 寸法を入力すると、スケッチと立体が作り直される
  const width = page.getByTestId("dim-width");
  await width.fill("80");
  await width.press("Enter");
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  await expect(page.getByTestId("sketch-view")).toContainText("80");

  // 作れない寸法は日本語で知らせる
  const holeX = page.getByTestId("dim-holeX");
  await holeX.fill("1");
  await holeX.press("Enter");
  await expect(page.getByTestId("problems")).toContainText("はみ出しています");
  await holeX.fill("10");
  await holeX.press("Enter");
  await expect(page.getByTestId("problems")).toHaveCount(0);

  // STL の書き出し
  const download = page.waitForEvent("download");
  await page.getByTestId("export-stl").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("plate-80x30x4.stl");

  expect(errors).toEqual([]);
});

test("右上の角をドラッグすると、よこ・たての寸法が変わる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  const handle = page.getByTestId("handle-corner");
  const box = (await handle.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy - 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  const w = Number(await page.getByTestId("dim-width").inputValue());
  const h = Number(await page.getByTestId("dim-height").inputValue());
  expect(w).toBeGreaterThan(50);
  expect(h).toBeGreaterThan(30);
});

test("連続テストを実行すると、計算時間が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  await page.getByTestId("run-stress").click();
  await expect(page.getByTestId("stress")).toContainText("平均");
  await expect(page.getByTestId("stress")).toContainText("失敗 0 回");
});

test("指(タッチ)で穴をドラッグすると、穴の位置が変わる", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || !testInfo.project.use.hasTouch, "タッチ入力は Chromium のタッチ端末設定で確認する");
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  const box = (await page.getByTestId("handle-hole").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", px: number, py: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py, id: 1 }],
    });
  await touch("touchStart", x, y);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x + i * 5, y - i * 3);
  await touch("touchEnd", x + 40, y - 24);
  await expect(page.getByTestId("status")).toHaveText("準備完了");
  expect(Number(await page.getByTestId("dim-holeX").inputValue())).toBeGreaterThan(8);
  expect(Number(await page.getByTestId("dim-holeY").inputValue())).toBeGreaterThan(15);
});
