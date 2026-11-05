// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { loadFont, measureVolume, setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { TEXT_FONT, rebuild } from "../../src/kernel/rebuild";
import { applyVariables, countUses, evaluateVariables, forgetName, renameInDoc } from "../../src/doc/variables";
import { evaluate } from "../../src/doc/expr";
import { docWith, rectSketch } from "./fixtures";
import type { ExtrudeFeature, MirrorFeature, PatternFeature, SketchFeature } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
  const ttf = readFileSync(new URL("../../public/fonts/MPLUSRounded1c-Bold.ttf", import.meta.url));
  await loadFont(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer, TEXT_FONT);
});

const box = (s: { boundingBox: { bounds: number[][] } }) => s.boundingBox.bounds;
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
const pattern = (over: Partial<PatternFeature> = {}): PatternFeature => ({
  id: "pt1",
  type: "pattern",
  name: "パターン1",
  source: "ex2",
  kind: "linear",
  axis: "x",
  flip: false,
  count: 3,
  spacing: 10,
  angle: 360,
  axis2: "y",
  count2: 1,
  spacing2: 10,
  ...over,
});

/** 中心 (x, y) に直径 d の円だけのスケッチ */
function circleSketch(id: string, x: number, y: number, d: number): SketchFeature {
  return {
    id,
    type: "sketch",
    name: id,
    plane: { kind: "base", name: "top" },
    entities: [
      { id: `${id}c`, type: "point", x, y },
      { id: `${id}o`, type: "circle", c: `${id}c`, r: d / 2 },
    ],
    constraints: [],
  };
}

/** 高さ 3mm の板の上の面にかいた文字 */
function textSketch(text: string, size: number): SketchFeature {
  return {
    id: "sk2",
    type: "sketch",
    name: "文字",
    plane: { kind: "face", featureId: "ex1", plane: { origin: [0, 0, 3], xDir: [1, 0, 0], normal: [0, 0, 1] } },
    entities: [
      { id: "tp", type: "point", x: 5, y: 5 },
      { id: "tx", type: "text", p: "tp", text, size },
    ],
    constraints: [],
  };
}

describe("文字", () => {
  it("名札: 板の上に文字を押し出してくっつけられる(漢字・ひらがな・英数字)", () => {
    const out = rebuild(docWith(rectSketch(60, 20), extrude({ distance: 3 }), textSketch("技術 たろう A1", 8), extrude({ id: "ex2", sketchId: "sk2", distance: 1 })), gcs);
    expect(out.statuses.map((s) => s.ok)).toEqual([true, true, true, true]);
    const [lo, hi] = box(out.body!);
    expect(hi[2]).toBeCloseTo(4, 3);
    expect(lo[2]).toBeCloseTo(0, 3);
    // 文字の分だけ体積が増える
    expect(measureVolume(out.body!)).toBeGreaterThan(60 * 20 * 3 + 10);
  });

  it("文字でけずる(彫る)こともできる", () => {
    const out = rebuild(
      docWith(rectSketch(60, 20), extrude({ distance: 3 }), textSketch("ABC", 10), extrude({ id: "ex2", sketchId: "sk2", distance: 1, operation: "cut" })),
      gcs,
    );
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    expect(measureVolume(out.body!)).toBeLessThan(60 * 20 * 3 - 10);
  });

  it("文字だけのスケッチは回転できないと知らせる", () => {
    const out = rebuild(docWith(textSketch("A", 8), { id: "rv", type: "revolve", name: "回転", sketchId: "sk2", axis: { kind: "y" }, angle: 360, operation: "add", flip: false }), gcs);
    expect(out.statuses[1]).toMatchObject({ ok: false, error: expect.stringContaining("文字は回転") });
  });
});

describe("ミラー(対称)", () => {
  it("立体全体を正面の面で鏡に映すと、反対側にもできる", () => {
    // 上の面の y=0〜20 にある板を、正面(XZ 平面)で写すと y=-20〜20 になる
    const mirror: MirrorFeature = { id: "mi", type: "mirror", name: "ミラー1", source: "body", plane: "front" };
    const out = rebuild(docWith(rectSketch(40, 20), extrude(), mirror), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const [lo, hi] = box(out.body!);
    expect(lo[1]).toBeCloseTo(-20, 3);
    expect(hi[1]).toBeCloseTo(20, 3);
    expect(measureVolume(out.body!)).toBeCloseTo(40 * 20 * 10 * 2, 0);
  });

  it("もう対称な形を写しても変わらないときは、そう知らせる", () => {
    const mirror: MirrorFeature = { id: "mi", type: "mirror", name: "ミラー1", source: "body", plane: "right" };
    const out = rebuild(docWith(circleSketch("d", 0, 0, 20), extrude({ sketchId: "d" }), mirror), gcs);
    expect(out.statuses[2]).toMatchObject({ ok: true, warning: expect.stringContaining("もう対称") });
  });

  it("穴の作業だけを右の面で写すと、穴が2つになる", () => {
    const hole = extrude({ id: "ex2", sketchId: "h", operation: "cut", flip: true });
    const mirror: MirrorFeature = { id: "mi", type: "mirror", name: "ミラー1", source: "ex2", plane: "right" };
    // 原点を中心にした円板に、x=10 の穴。右の面(YZ)で写すと x=-10 にも穴があく
    const out = rebuild(docWith(circleSketch("d", 0, 0, 60), extrude({ sketchId: "d" }), circleSketch("h", 10, 10, 4), hole, mirror), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const one = Math.PI * 4 * 10;
    expect(measureVolume(out.body!)).toBeCloseTo(Math.PI * 900 * 10 - 2 * one, 0);
  });
});

describe("パターン(ならべる)", () => {
  const holeDoc = (p: PatternFeature) =>
    docWith(rectSketch(60, 40), extrude(), circleSketch("h", 10, 10, 4), extrude({ id: "ex2", sketchId: "h", operation: "cut", flip: true }), p);
  const hole = Math.PI * 4 * 10;

  it("まっすぐ3つならべる", () => {
    const out = rebuild(holeDoc(pattern()), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    expect(measureVolume(out.body!)).toBeCloseTo(60 * 40 * 10 - 3 * hole, 0);
  });

  it("2方向(格子)に 3×2 でならべる", () => {
    const out = rebuild(holeDoc(pattern({ count2: 2, spacing2: 15 })), gcs);
    expect(measureVolume(out.body!)).toBeCloseTo(60 * 40 * 10 - 6 * hole, 0);
  });

  it("円のまわりに一周 6 こならべる", () => {
    const disc = docWith(circleSketch("d", 0, 0, 60), extrude({ sketchId: "d" }), circleSketch("h", 20, 0, 4), extrude({ id: "ex2", sketchId: "h", operation: "cut", flip: true }), pattern({ kind: "circular", axis: "z", count: 6 }));
    const out = rebuild(disc, gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    expect(measureVolume(out.body!)).toBeCloseTo(Math.PI * 900 * 10 - 6 * hole, 0);
  });

  it("多すぎる数や、こわれた作業は日本語で知らせる", () => {
    expect(rebuild(holeDoc(pattern({ count: 20, count2: 20 })), gcs).statuses[4]).toMatchObject({ ok: false, error: expect.stringContaining("100") });
    expect(rebuild(holeDoc(pattern({ source: "nope" })), gcs).statuses[4]).toMatchObject({ ok: false, error: expect.stringContaining("ならべる作業") });
  });
});

describe("変数", () => {
  it("式に変数の名前を使える", () => {
    expect(evaluate("幅/2", { 幅: 40 })).toBe(20);
    expect(evaluate("(幅+あつさ)*2", { 幅: 40, あつさ: 5 })).toBe(90);
    expect(evaluate("幅2", { 幅: 40 })).toBeNull();
  });

  it("上の変数だけを使える。計算できない変数は理由を返す", () => {
    const r = evaluateVariables([
      { id: "v1", name: "幅", expr: "40", value: 0 },
      { id: "v2", name: "半分", expr: "幅/2", value: 0 },
      { id: "v3", name: "あと", expr: "まだ*2", value: 0 },
      { id: "v4", name: "まだ", expr: "1", value: 0 },
      { id: "v5", name: "2bad", expr: "1", value: 0 },
    ]);
    expect(r.values).toEqual({ 幅: 40, 半分: 20, まだ: 1 });
    expect(r.errors.v3).toContain("まだ");
    expect(r.errors.v5).toContain("名前");
  });

  it("変数を変えると、寸法とあつさが計算し直され、形も変わる", () => {
    const sk = rectSketch(40, 20);
    sk.constraints = sk.constraints.map((c) => (c.id === "k5" ? { ...c, expr: "幅" } : c));
    const doc = { ...docWith(sk, extrude({ exprs: { distance: "幅/4" } })), variables: [{ id: "v1", name: "幅", expr: "60", value: 40 }] };
    const next = applyVariables(doc);
    expect(next.variables![0].value).toBe(60);
    expect((next.features[1] as ExtrudeFeature).distance).toBe(15);
    const out = rebuild(next, gcs);
    expect(measureVolume(out.body!)).toBeCloseTo(60 * 20 * 15, 0);

    expect(countUses(next, "幅")).toBe(2);
    const renamed = renameInDoc(next, "幅", "よこ");
    expect((renamed.features[1] as ExtrudeFeature).exprs).toEqual({ distance: "よこ/4" });
    const forgot = forgetName(renamed, "よこ");
    expect((forgot.features[1] as ExtrudeFeature).exprs).toEqual({});
    expect((forgot.features[1] as ExtrudeFeature).distance).toBe(15);
  });
});
