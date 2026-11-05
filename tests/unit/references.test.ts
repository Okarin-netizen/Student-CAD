import { describe, expect, it } from "vitest";
import { edgesOnPlane, referenceCorners } from "../../src/app/sketch/references";
import { planeFromFace } from "../../src/doc/planes";

describe("下がき(面の上の輪郭)", () => {
  // 0..40 × 0..20 × 0..10 の箱の上の面の輪郭と、縦の辺1本
  const edges = Float32Array.from([
    0, 0, 10, 40, 0, 10,
    40, 0, 10, 40, 20, 10,
    40, 20, 10, 0, 20, 10,
    0, 20, 10, 0, 0, 10,
    0, 0, 0, 0, 0, 10,
  ]);

  it("面の上にある線だけを、スケッチの座標にする", () => {
    const plane = planeFromFace([20, 10, 10], [0, 0, 1]);
    const segs = edgesOnPlane(edges, plane);
    expect(segs.length).toBe(16);
    expect(Array.from(segs.slice(0, 4)).map((v) => Math.round(v))).toEqual([-20, -10, 20, -10]);
  });

  it("角は4つ。まっすぐつながる点は角にしない", () => {
    const plane = planeFromFace([20, 10, 10], [0, 0, 1]);
    expect(referenceCorners(edgesOnPlane(edges, plane))).toHaveLength(4);
    const straight = Float32Array.from([0, 0, 5, 0, 5, 0, 10, 0]);
    expect(referenceCorners(straight)).toHaveLength(2);
  });
});
