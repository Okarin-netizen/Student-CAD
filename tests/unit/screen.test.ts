// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 2026-11-10 画面の見直し(次に押すボタン・れきしの言葉)のテスト
import { describe, expect, it } from "vitest";
import type { ExtrudeFeature, SketchFeature } from "../../src/doc/types";
import { stepGuide } from "../../src/app/stepGuide";
import { featureLabel, withFeatureLabels } from "../../src/app/terms";
import { docWith, rectSketch } from "./fixtures";

const extrude = (sketchId: string): ExtrudeFeature => ({ id: "ex1", type: "extrude", name: "押し出し1", sketchId, distance: 10, operation: "add", flip: false });

describe("次に押すボタン", () => {
  it("何もないときは「絵をかく」が次で、立体にする・角を丸める・そのほか はまだ使えない", () => {
    const g = stepGuide(docWith(), false);
    expect(g.next).toBe("sketch");
    expect(Object.keys(g.notReady).sort()).toEqual(["extrude", "fillet", "more", "revolve"]);
  });

  it("まだ使っていない絵があれば「立体にする」が次", () => {
    const g = stepGuide(docWith(rectSketch(10, 10)), false);
    expect(g.next).toBe("extrude");
    expect(g.notReady.extrude).toBeUndefined();
    expect(g.notReady.fillet).toContain("立体にする");
  });

  it("補助線(軸)のある絵なら「回転」が次", () => {
    const sk = rectSketch(10, 10);
    sk.entities.push({ id: "p", type: "point", x: 0, y: 0 }, { id: "q", type: "point", x: 0, y: 5 }, { id: "ax", type: "line", p1: "p", p2: "q", construction: true });
    expect(stepGuide(docWith(sk), false).next).toBe("revolve");
  });

  it("閉じていない線だけの絵では、立体にするはまだ使えない", () => {
    const sk: SketchFeature = { ...rectSketch(10, 10), entities: rectSketch(10, 10).entities.filter((e) => e.id !== "l4"), constraints: [] };
    const g = stepGuide(docWith(sk), false);
    expect(g.notReady.extrude).toContain("閉じた形");
    expect(g.notReady.more).toBeUndefined();
  });

  it("立体ができたら「書き出す」が次で、使えないボタンはない", () => {
    const g = stepGuide(docWith(rectSketch(10, 10), extrude("sk1")), true);
    expect(g.next).toBe("export");
    expect(g.notReady).toEqual({});
  });
});

describe("れきしの言葉", () => {
  it("ふだんはボタンと同じ言葉で見せる", () => {
    expect(featureLabel("押し出し1", false)).toBe("立体1");
    expect(featureLabel("スケッチ12", false)).toBe("絵12");
    expect(featureLabel("回転2", false)).toBe("回転2");
  });

  it("専門用語のときと、自分でつけた名前はそのまま", () => {
    expect(featureLabel("押し出し1", true)).toBe("押し出し1");
    expect(featureLabel("持ち手", false)).toBe("持ち手");
    expect(featureLabel("押し出し", false)).toBe("押し出し");
  });

  it("エラー文の中の名前も読みかえる", () => {
    expect(withFeatureLabels("「スケッチ1」には、閉じた形を1つだけかいてください", ["スケッチ1"], false)).toBe("「絵1」には、閉じた形を1つだけかいてください");
  });
});
