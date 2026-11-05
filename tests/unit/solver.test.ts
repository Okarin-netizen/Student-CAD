// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { beforeAll, describe, expect, it } from "vitest";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { solveSketch, measureAngle } from "../../src/sketch/solver";
import { rectSketch } from "./fixtures";
import type { LineEntity, SketchFeature } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
});

const pt = (s: { entities: SketchFeature["entities"] }, id: string) => {
  const e = s.entities.find((x) => x.id === id)!;
  return e.type === "point" ? [e.x, e.y] : null;
};

describe("solveSketch", () => {
  it("寸法つきの長方形は完全定義(自由度0)になる", () => {
    const r = solveSketch(gcs, rectSketch(40, 20));
    expect(r.ok).toBe(true);
    expect(r.dof).toBe(0);
    expect(pt(r, "c")![0]).toBeCloseTo(40, 6);
    expect(pt(r, "c")![1]).toBeCloseTo(20, 6);
  });

  it("寸法を1つ消すと自由度が1残る", () => {
    const s = rectSketch(40, 20);
    s.constraints = s.constraints.filter((c) => c.id !== "k6");
    const r = solveSketch(gcs, s);
    expect(r.ok).toBe(true);
    expect(r.dof).toBe(1);
  });

  it("矛盾する寸法は失敗として返し、図形は変えない", () => {
    const s = rectSketch(40, 20);
    s.constraints.push({ id: "bad", type: "length", line: "l3", value: 10 });
    const r = solveSketch(gcs, s);
    expect(r.ok).toBe(false);
    expect(r.entities).toBe(s.entities);
  });

  it("重複する拘束(決まりすぎ)も失敗として返す", () => {
    const s = rectSketch(40, 20);
    s.constraints.push({ id: "dup", type: "length", line: "l3", value: 40 });
    const r = solveSketch(gcs, s);
    expect(r.ok).toBe(false);
  });

  it("ドラッグで点を動かすと、拘束を守ったまま動く", () => {
    const s = rectSketch(40, 20);
    s.constraints = s.constraints.filter((c) => c.id !== "k5" && c.id !== "k6");
    const r = solveSketch(gcs, s, { points: [{ id: "c", x: 55, y: 33 }] });
    expect(r.ok).toBe(true);
    expect(pt(r, "c")![0]).toBeCloseTo(55, 3);
    expect(pt(r, "b")![0]).toBeCloseTo(55, 3); // 垂直の拘束で一緒に動く
    expect(pt(r, "b")![1]).toBeCloseTo(0, 3);
  });

  it("角度の寸法", () => {
    const s = rectSketch(40, 20);
    s.constraints = s.constraints.filter((c) => c.id !== "k4" && c.id !== "k2");
    const l1 = s.entities.find((e) => e.id === "l1") as LineEntity;
    const l4 = s.entities.find((e) => e.id === "l4") as LineEntity;
    s.constraints.push({ id: "ang", type: "angle", a: "l1", b: "l4", value: -60 });
    const r = solveSketch(gcs, s);
    expect(r.ok).toBe(true);
    expect(Math.abs(measureAngle(r.entities, l1, l4))).toBeCloseTo(60, 3);
  });
});
