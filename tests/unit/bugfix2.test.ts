// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 操作して見つけたバグの再発を防ぐテスト その2(2026-11-21)

import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { rebuild } from "../../src/kernel/rebuild";
import { docWith, rectSketch } from "./fixtures";
import { forgetName } from "../../src/doc/variables";
import { easyWords } from "../../src/app/terms";
import { emptyDocument, type ExtrudeFeature } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
});

const extrude = (over: Partial<ExtrudeFeature> = {}): ExtrudeFeature => ({
  id: "ex1",
  type: "extrude",
  name: "押し出し1",
  sketchId: "sk1",
  distance: 10,
  operation: "add",
  flip: false,
  ...over,
});

/** 40×20 の板の上の面(高さ 10)の、まん中あたりにかいた 10×10 の四角を、5mm 押し出す */
function boxWithBump(base: Partial<ExtrudeFeature>) {
  const bump = rectSketch(10, 10, 0, "sk2");
  bump.plane = { kind: "face", featureId: "ex1", plane: { origin: [15, 5, 10], xDir: [1, 0, 0], normal: [0, 0, 1] } };
  return docWith(rectSketch(40, 20), extrude(base), bump, extrude({ id: "ex2", name: "押し出し2", sketchId: "sk2", distance: 5 }));
}

describe("立体の面にかいた絵", () => {
  it("下の立体を高くすると、絵も上の面について上がる(立体の中にうまっていた)", () => {
    const out = rebuild(boxWithBump({ distance: 30 }), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const [, hi] = out.body!.boundingBox.bounds;
    expect(hi[2]).toBeCloseTo(35, 3);
    expect(out.sketches.find((s) => s.featureId === "sk2")!.plane.origin[2]).toBeCloseTo(30, 3);
  });

  it("下の立体の向きを反対にすると、絵も上の面(高さ 0)へ動く(宙にういていた)", () => {
    const out = rebuild(boxWithBump({ flip: true }), gcs);
    const [lo, hi] = out.body!.boundingBox.bounds;
    expect(lo[2]).toBeCloseTo(-10, 3);
    expect(hi[2]).toBeCloseTo(5, 3);
  });

  it("面が動いていなければ、そのまま", () => {
    const out = rebuild(boxWithBump({}), gcs);
    expect(out.body!.boundingBox.bounds[1][2]).toBeCloseTo(15, 3);
  });
});

describe("基準の数をけす", () => {
  it("ほかの基準の数の式で使っていたら、その数は いまの数のまま残す(計算できなくなっていた)", () => {
    const doc = {
      ...emptyDocument(),
      variables: [
        { id: "v2", name: "高さ", expr: "横/2", value: 20 },
        { id: "v3", name: "奥", expr: "高さ+1", value: 21 },
      ],
    };
    const out = forgetName(doc, "横");
    expect(out.variables!.map((v) => v.expr)).toEqual(["20", "高さ+1"]);
  });
});

describe("ふだんの言葉", () => {
  it("エラーや案内の「スケッチ」を「絵」にする", () => {
    expect(easyWords("スケッチに閉じた形がありません", false)).toBe("絵に閉じた形がありません");
    expect(easyWords("つなぐスケッチを2つ以上えらんでください", false)).toBe("つなぐ絵を2つ以上えらんでください");
    expect(easyWords("スケッチの寸法や拘束が矛盾しています", false)).toBe("絵の寸法やきまりが矛盾しています");
    expect(easyWords("スケッチに閉じた形がありません", true)).toBe("スケッチに閉じた形がありません");
  });
});
