// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import type { SketchConstraint, SketchEntity } from "../../src/doc/types";
import { checkSketch, hasIssues } from "../../src/sketch/sketchCheck";

/** 点の座標と、点をむすぶ線から絵を作る */
function sketchOf(points: Record<string, [number, number]>, lines: [string, string][], constraints: SketchConstraint[] = []) {
  const entities: SketchEntity[] = [
    ...Object.entries(points).map(([id, [x, y]]) => ({ id, type: "point" as const, x, y })),
    ...lines.map(([p1, p2], i) => ({ id: `l${i + 1}`, type: "line" as const, p1, p2 })),
  ];
  return { entities, constraints };
}

const square = { a: [0, 0], b: [40, 0], c: [40, 40], d: [0, 40] } as Record<string, [number, number]>;

describe("checkSketch", () => {
  it("閉じた四角には問題がない", () => {
    const r = checkSketch(sketchOf(square, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]]));
    expect(hasIssues(r)).toBe(false);
    expect(r.openCurves).toEqual([]);
  });

  it("1本たりない四角は、はしが2つで、3本とも閉じていない線", () => {
    const r = checkSketch(sketchOf(square, [["a", "b"], ["b", "c"], ["c", "d"]]));
    expect(r.looseEnds.map((e) => e.point).sort()).toEqual(["a", "d"]);
    expect(r.openCurves.sort()).toEqual(["l1", "l2", "l3"]);
    // a と d のすき間 40mm は大きすぎるので「つなぐ」の組にはしない
    expect(r.nearPairs).toEqual([]);
  });

  it("少しすき間のある四角は、そのはしの組を「つなぐ」で直せる", () => {
    const pts = { ...square, e: [2, 1] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]]));
    expect(r.looseEnds).toHaveLength(2);
    expect(r.nearPairs).toHaveLength(1);
    expect([r.nearPairs[0].a, r.nearPairs[0].b].sort()).toEqual(["a", "e"]);
  });

  it("一致のきまりでつないだ はしは、はしではない", () => {
    const pts = { ...square, e: [0, 0] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]], [{ id: "k", type: "coincident", a: "e", b: "a" }]));
    expect(hasIssues(r)).toBe(false);
  });

  it("同じ所にあるのに つながっていない はしは「線のとちゅう」ではなく、つなぐ組になる", () => {
    const pts = { ...square, e: [0, 0] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]]));
    expect(r.looseEnds.every((e) => !e.onCurve)).toBe(true);
    expect(r.nearPairs).toHaveLength(1);
  });

  it("線のとちゅうにつけた はしを見分ける(T の字)", () => {
    const pts = { ...square, m: [20, 0] as [number, number], t: [20, 20] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["m", "t"]]));
    const m = r.looseEnds.find((e) => e.point === "m");
    expect(m?.onCurve).toBe(true);
    expect(r.looseEnds.find((e) => e.point === "t")?.onCurve).toBe(false);
    // ふちの四角も、とちゅうにさわっている線とは点でつながっていないので、閉じた輪のまま
    expect(r.openCurves).toEqual(["l5"]);
  });

  it("3本の線が集まる点は分かれ道", () => {
    const pts = { ...square, x: [60, 0] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["b", "x"]]));
    expect(r.branches).toEqual([[40, 0]]);
    expect(r.openCurves).toHaveLength(5);
  });

  it("同じ2点に2本の線をかくと重なり", () => {
    const r = checkSketch(sketchOf(square, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["b", "a"]]));
    expect(r.overlaps.sort()).toEqual(["l1", "l5"]);
  });

  it("同じ線の上で一部が重なる線も重なり", () => {
    const pts = { ...square, p: [10, 0] as [number, number], q: [30, 0] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["p", "q"]]));
    expect(r.overlaps.sort()).toEqual(["l1", "l5"]);
  });

  it("線どうしの交差を見つける(はしでつながった所は数えない)", () => {
    const pts = { ...square, p: [20, -10] as [number, number], q: [20, 50] as [number, number] };
    const r = checkSketch(sketchOf(pts, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["p", "q"]]));
    expect(r.crossings).toHaveLength(2);
    expect(r.crossings.map((p) => p.map((v) => Math.round(v)))).toEqual(
      expect.arrayContaining([
        [20, 0],
        [20, 40],
      ]),
    );
  });

  it("1本の線や「く」の字の両はしは、つなぐ組にしない(線がつぶれるため)", () => {
    expect(checkSketch(sketchOf({ a: [0, 0], b: [3, 0] }, [["a", "b"]])).nearPairs).toEqual([]);
    expect(checkSketch(sketchOf({ a: [0, 0], b: [20, 20], c: [1, 0] }, [["a", "b"], ["b", "c"]])).nearPairs).toEqual([]);
  });

  it("補助線は調べない", () => {
    const s = sketchOf(square, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["a", "c"]]);
    s.entities = s.entities.map((e) => (e.id === "l5" ? { ...e, construction: true } : e));
    expect(hasIssues(checkSketch(s))).toBe(false);
  });
});
