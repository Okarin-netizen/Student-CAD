import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { measureVolume, setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { meshBody, rebuild } from "../../src/kernel/rebuild";
import { docWith, rectSketch } from "./fixtures";
import type { ExtrudeFeature, FilletFeature, RevolveFeature } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
});

const box = (s: { boundingBox: { bounds: number[][] } }) => s.boundingBox.bounds;
const extrude: ExtrudeFeature = { id: "ex1", type: "extrude", name: "押し出し1", sketchId: "sk1", distance: 10, operation: "add", flip: false };
const revolve = (over: Partial<RevolveFeature> = {}): RevolveFeature => ({
  id: "rv1",
  type: "revolve",
  name: "回転1",
  sketchId: "sk1",
  axis: { kind: "y" },
  angle: 360,
  operation: "add",
  flip: false,
  ...over,
});

describe("回転", () => {
  it("長方形をたての軸のまわりに一周させると円柱になる", () => {
    const out = rebuild(docWith(rectSketch(10, 20), revolve()), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const [lo, hi] = box(out.body!);
    // 上の面のたての軸(世界の Y 軸)のまわりに回るので、Y 方向に高さ 20、X と Z に半径 10
    expect(hi[0]).toBeCloseTo(10, 2);
    expect(lo[0]).toBeCloseTo(-10, 2);
    expect(hi[1]).toBeCloseTo(20, 2);
    expect(hi[2]).toBeCloseTo(10, 2);
    expect(lo[2]).toBeCloseTo(-10, 2);
    expect(measureVolume(out.body!)).toBeCloseTo(Math.PI * 100 * 20, 0);
  });

  it("半周だけ回すと体積も半分", () => {
    const out = rebuild(docWith(rectSketch(10, 20), revolve({ angle: 180 })), gcs);
    expect(measureVolume(out.body!)).toBeCloseTo((Math.PI * 100 * 20) / 2, 0);
  });

  it("形が軸の両側にあると、日本語で知らせる", () => {
    const out = rebuild(docWith(rectSketch(10, 20), revolve({ axis: { kind: "x" }, angle: 90 }), revolve({ id: "rv2", axis: { kind: "line", line: "nope" } })), gcs);
    expect(out.statuses[1].ok).toBe(true); // x 軸は長方形の下の辺 → 片側だけ
    expect(out.statuses[2]).toMatchObject({ ok: false, error: expect.stringContaining("軸") });
  });
});

describe("角を丸める・落とす", () => {
  it("辺の真ん中の点で選んだ辺だけが丸まる", () => {
    const base = rebuild(docWith(rectSketch(40, 20), extrude), gcs);
    const mesh = meshBody(base.body!);
    expect(mesh.edgeGroups.length).toBe(12);
    // 上の面の手前の辺(y=0, z=10)
    const front = mesh.edgeGroups.find((g) => Math.abs(g.mid[1]) < 1e-3 && Math.abs(g.mid[2] - 10) < 1e-3)!;
    expect(front.mid[0]).toBeCloseTo(20, 3);
    const fillet: FilletFeature = { id: "fl1", type: "fillet", name: "丸め1", kind: "fillet", radius: 3, edges: [{ mid: front.mid }] };
    const out = rebuild(docWith(rectSketch(40, 20), extrude, fillet), gcs);
    expect(out.statuses.every((s) => s.ok)).toBe(true);
    const lost = 3 * 3 - (Math.PI * 9) / 4; // 角の断面で失う面積
    expect(measureVolume(out.body!)).toBeCloseTo(40 * 20 * 10 - lost * 40, 0);

    const chamfer = rebuild(docWith(rectSketch(40, 20), extrude, { ...fillet, kind: "chamfer" }), gcs);
    expect(measureVolume(chamfer.body!)).toBeCloseTo(40 * 20 * 10 - 4.5 * 40, 0);
  });

  it("大きすぎる丸めや、見つからない辺は日本語で知らせる", () => {
    const fillet: FilletFeature = { id: "fl1", type: "fillet", name: "丸め1", kind: "fillet", radius: 30, edges: [{ mid: [20, 0, 10] }] };
    const big = rebuild(docWith(rectSketch(40, 20), extrude, fillet), gcs);
    expect(big.statuses[2]).toMatchObject({ ok: false });
    const gone = rebuild(docWith(rectSketch(40, 20), extrude, { ...fillet, radius: 2, edges: [{ mid: [100, 100, 100] }] }), gcs);
    expect(gone.statuses[2]).toMatchObject({ ok: false, error: expect.stringContaining("見つかりません") });
    // 寸法を少し変えても、近い辺を見つけて丸め続ける
    const moved = rebuild(docWith(rectSketch(42, 20), extrude, { ...fillet, radius: 2 }), gcs);
    expect(moved.statuses[2].ok).toBe(true);
  });
});
