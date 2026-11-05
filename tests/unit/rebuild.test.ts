// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { meshBody, rebuild } from "../../src/kernel/rebuild";
import { docWith, rectSketch } from "./fixtures";
import type { ExtrudeFeature } from "../../src/doc/types";

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
  distance: 5,
  operation: "add",
  flip: false,
  ...over,
});

const box = (s: { boundingBox: { bounds: number[][] } }) => s.boundingBox.bounds;

describe("rebuild", () => {
  it("スケッチを押し出すと、寸法どおりの立体になる", () => {
    const out = rebuild(docWith(rectSketch(40, 20, 6), extrude()), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const [lo, hi] = box(out.body!);
    expect(lo[0]).toBeCloseTo(0, 3);
    expect(hi[0]).toBeCloseTo(40, 3);
    expect(hi[1]).toBeCloseTo(20, 3);
    expect(hi[2]).toBeCloseTo(5, 3);
    expect(lo[2]).toBeCloseTo(0, 3);
    const mesh = meshBody(out.body!);
    expect(mesh.faces.length).toBe(mesh.faceGroups.length);
    // 上下4面 + 側面4面 + 穴の円筒1面 = 7面(上・下・側面4・穴)
    expect(mesh.faces.filter((f) => f.planar).length).toBe(6);
  });

  it("「向きを反対に」で下へ伸びる", () => {
    const out = rebuild(docWith(rectSketch(40, 20), extrude({ flip: true })), gcs);
    const [lo, hi] = box(out.body!);
    expect(lo[2]).toBeCloseTo(-5, 3);
    expect(hi[2]).toBeCloseTo(0, 3);
  });

  it("けずる押し出しは、立体から穴をあける", () => {
    const top = rectSketch(10, 10, 0, "sk2");
    top.plane = { kind: "face", featureId: "ex1", plane: { origin: [0, 0, 5], xDir: [1, 0, 0], normal: [0, 0, 1] } };
    const doc = docWith(rectSketch(40, 20), extrude(), top, extrude({ id: "ex2", sketchId: "sk2", operation: "cut", distance: 2 }));
    const out = rebuild(doc, gcs);
    expect(out.statuses.map((s) => s.ok)).toEqual([true, true, true, true]);
    expect(meshBody(out.body!).faces.length).toBeGreaterThan(6);
    expect(out.sketches.every((s) => s.consumed)).toBe(true);
  });

  it("立体がないのにけずると、その作業だけエラーになる", () => {
    const out = rebuild(docWith(rectSketch(40, 20), extrude({ operation: "cut" })), gcs);
    expect(out.statuses[1]).toMatchObject({ ok: false });
    expect(out.body).toBeNull();
  });

  it("寸法を変えて作り直すと形が追従する(パラメトリック)", () => {
    const s = rectSketch(40, 20);
    const first = rebuild(docWith(s, extrude()), gcs);
    expect(box(first.body!)[1][0]).toBeCloseTo(40, 3);
    s.constraints = s.constraints.map((c) => (c.id === "k5" && c.type === "length" ? { ...c, value: 70 } : c));
    const second = rebuild(docWith(s, extrude()), gcs);
    expect(box(second.body!)[1][0]).toBeCloseTo(70, 3);
  });
});
