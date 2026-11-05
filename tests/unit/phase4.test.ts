// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { measureVolume, setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { rebuild } from "../../src/kernel/rebuild";
import { resolvePlane, planeLabel } from "../../src/doc/planes";
import { docWith, rectSketch } from "./fixtures";
import type { ExtrudeFeature, LoftFeature, ShellFeature, SketchFeature } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
});

const extrude = (distance: number): ExtrudeFeature => ({ id: "ex1", type: "extrude", name: "押し出し1", sketchId: "sk1", distance, operation: "add", flip: false });

/** 上の面から h mm 上に、中心 (cx, cy)・直径 d の円 */
function circleAt(id: string, h: number, cx: number, cy: number, d: number): SketchFeature {
  return {
    id,
    type: "sketch",
    name: id,
    plane: { kind: "offset", base: "top", distance: h },
    entities: [
      { id: `${id}c`, type: "point", x: cx, y: cy },
      { id: `${id}o`, type: "circle", c: `${id}c`, r: d / 2 },
    ],
    constraints: [],
  };
}

const loft = (sketchIds: string[], over: Partial<LoftFeature> = {}): LoftFeature => ({ id: "lf1", type: "loft", name: "ロフト1", sketchIds, operation: "add", ruled: false, ...over });

describe("面をずらす", () => {
  it("上の面から 30mm 上の面は、高さ 30 にある", () => {
    expect(resolvePlane({ kind: "offset", base: "top", distance: 30 }).origin).toEqual([0, 0, 30]);
    // 正面の向き(法線)は手前(-Y)なので、ずらすと手前に出る
    expect(resolvePlane({ kind: "offset", base: "front", distance: 10 }).origin[1]).toBe(-10);
    expect(planeLabel({ kind: "offset", base: "top", distance: 30 })).toBe("上の面から 30mm");
  });
});

describe("つなぐ(ロフト)", () => {
  it("同じ大きさの円を2つつなぐと円柱になる", () => {
    const out = rebuild(docWith(circleAt("a", 0, 0, 0, 20), circleAt("b", 30, 0, 0, 20), loft(["a", "b"])), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    expect(measureVolume(out.body!)).toBeCloseTo(Math.PI * 100 * 30, 0);
  });

  it("四角から円へつなげる。3つ以上もつなげる", () => {
    const sq = rectSketch(20, 20);
    const out = rebuild(docWith(sq, circleAt("b", 20, 10, 10, 12), circleAt("c", 40, 10, 10, 20), loft(["sk1", "b", "c"])), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const [lo, hi] = out.body!.boundingBox.bounds;
    expect(hi[2] - lo[2]).toBeCloseTo(40, 3);
    // つないだスケッチは「使った」ことになる(3D で線を出さない)
    expect(out.sketches.filter((s) => s.consumed)).toHaveLength(3);
  });

  it("同じ面のスケッチ・穴のある形・1つだけはエラーで知らせる", () => {
    const same = rebuild(docWith(circleAt("a", 0, 0, 0, 20), circleAt("b", 0, 50, 0, 20), loft(["a", "b"])), gcs);
    expect(same.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("同じ面") });
    const holed = rebuild(docWith(rectSketch(40, 20, 8), circleAt("b", 20, 20, 10, 10), loft(["sk1", "b"])), gcs);
    expect(holed.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("1つだけ") });
    const one = rebuild(docWith(circleAt("a", 0, 0, 0, 20), loft(["a"])), gcs);
    expect(one.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("2つ以上") });
  });
});

describe("くりぬく(シェル)", () => {
  const shell = (over: Partial<ShellFeature> = {}): ShellFeature => ({
    id: "sh1",
    type: "shell",
    name: "くりぬき1",
    thickness: 2,
    faces: [{ point: [10, 5, 30], normal: [0, 0, 1] }],
    ...over,
  });

  it("上の面を取りのぞいて、まわりを 2mm のこす(ペン立て)", () => {
    const out = rebuild(docWith(rectSketch(40, 20), extrude(30), shell()), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    expect(measureVolume(out.body!)).toBeCloseTo(40 * 20 * 30 - 36 * 16 * 28, 1);
  });

  it("面をえらんでいない・面がもうない・あつすぎるときは、エラーで知らせる", () => {
    const none = rebuild(docWith(rectSketch(40, 20), extrude(30), shell({ faces: [] })), gcs);
    expect(none.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("タップ") });
    // 板を低くしたので、えらんだ点(高さ 30)はもう面の上にない
    const moved = rebuild(docWith(rectSketch(40, 20), extrude(10), shell()), gcs);
    expect(moved.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("えらび直して") });
    const thick = rebuild(docWith(rectSketch(40, 20), extrude(30), shell({ thickness: 15 })), gcs);
    expect(thick.statuses.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("あつさ") });
  });
});
