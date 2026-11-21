// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// デザインの改善 段階3(2026-11-21): 長方形・円に最初から大きさの寸法を入れる

import { beforeAll, describe, expect, it } from "vitest";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { addCircle, addConstraintOverAuto, addRectangle, addSizeDimensions, setDimension, type SketchData } from "../../src/sketch/edit";
import type { DimensionConstraint } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
});

const empty: SketchData = { entities: [], constraints: [] };
const dims = (s: SketchData) => s.constraints.filter((c) => "value" in c) as DimensionConstraint[];

/** 40×20 の長方形に、横と たての自動の寸法を入れる */
function rect() {
  const r = addRectangle(empty, { xy: [0, 0] }, { xy: [40, 20] });
  const lines = r.entities.filter((e) => e.type === "line").map((e) => e.id);
  return { sketch: addSizeDimensions(gcs, r, lines.slice(0, 2)), lines };
}

describe("最初から入る大きさの寸法", () => {
  it("長方形には横 40 と たて 20 の寸法が入る", () => {
    const d = dims(rect().sketch);
    expect(d.map((c) => c.value).sort((a, b) => a - b)).toEqual([20, 40]);
    expect(d.every((c) => c.auto)).toBe(true);
  });

  it("円には直径の寸法が入る(0.1mm に丸める)", () => {
    const c = addCircle(empty, { xy: [0, 0] }, 7.234);
    const s = addSizeDimensions(gcs, c, [c.entities[c.entities.length - 1].id]);
    expect(dims(s)).toMatchObject([{ type: "diameter", value: 14.5, auto: true }]);
  });

  it("反対の辺に長さを入れると、自動の寸法と入れかわる(決まりすぎにならない)", () => {
    const { sketch, lines } = rect();
    const r = addConstraintOverAuto(gcs, sketch, { id: "d9", type: "length", line: lines[2], value: 50 });
    expect(r.ok).toBe(true);
    const d = dims(r.sketch);
    expect(d).toHaveLength(2);
    expect(d.find((c) => c.id === "d9")?.value).toBe(50);
  });

  it("生徒が入れた寸法は入れかえない", () => {
    const { sketch, lines } = rect();
    const top = dims(sketch).find((c) => c.type === "length" && c.line === lines[0])!;
    const edited = setDimension(gcs, sketch, top.id, 30);
    expect(dims(edited.sketch).find((c) => c.id === top.id)?.auto).toBeUndefined();
    const r = addConstraintOverAuto(gcs, edited.sketch, { id: "d9", type: "length", line: lines[2], value: 50 });
    expect(r.ok).toBe(false);
  });
});
