import { beforeAll, describe, expect, it } from "vitest";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { DEFAULT_PARAMS } from "../../src/model/params";
import { solvePlateSketch } from "../../src/sketch/plateSketch";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
});

describe("solvePlateSketch(planegcs による拘束計算)", () => {
  it("ずらした初期形から、寸法どおりの長方形と穴に収束する", () => {
    const s = solvePlateSketch(gcs, DEFAULT_PARAMS);
    expect(s.ok).toBe(true);
    const [p0, p1, p2, p3] = s.corners;
    expect(p0[0]).toBeCloseTo(0, 6);
    expect(p0[1]).toBeCloseTo(0, 6);
    expect(p1[0]).toBeCloseTo(50, 6);
    expect(p1[1]).toBeCloseTo(0, 6);
    expect(p2[0]).toBeCloseTo(50, 6);
    expect(p2[1]).toBeCloseTo(30, 6);
    expect(p3[0]).toBeCloseTo(0, 6);
    expect(p3[1]).toBeCloseTo(30, 6);
    expect(s.hole?.cx).toBeCloseTo(8, 6);
    expect(s.hole?.cy).toBeCloseTo(15, 6);
    expect(s.hole?.r).toBeCloseTo(3, 6);
  });

  it("寸法を変えると形が追従する(前回の形を初期値にしても)", () => {
    const first = solvePlateSketch(gcs, DEFAULT_PARAMS);
    const s = solvePlateSketch(gcs, { ...DEFAULT_PARAMS, width: 72.5, holeY: 10 }, first.corners);
    expect(s.ok).toBe(true);
    expect(s.corners[2][0]).toBeCloseTo(72.5, 6);
    expect(s.hole?.cy).toBeCloseTo(10, 6);
  });

  it("穴の直径が 0 なら穴なし", () => {
    const s = solvePlateSketch(gcs, { ...DEFAULT_PARAMS, holeDiameter: 0 });
    expect(s.ok).toBe(true);
    expect(s.hole).toBeNull();
  });
});
