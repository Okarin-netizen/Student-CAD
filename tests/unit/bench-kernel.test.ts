import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { DEFAULT_PARAMS } from "../../src/bench/params";
import { solvePlateSketch } from "../../src/bench/plateSketch";
import { buildPlate, meshShape } from "../../src/bench/buildPlate";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
});

describe("buildPlate(OpenCascade による立体化)", () => {
  it("スケッチを押し出して、寸法どおりの大きさの立体になる", () => {
    const sketch = solvePlateSketch(gcs, DEFAULT_PARAMS);
    const solid = buildPlate(sketch, { thickness: 4, cornerRadius: 3 });
    const { bounds } = solid.boundingBox;
    expect(bounds[0][0]).toBeCloseTo(0, 3);
    expect(bounds[1][0]).toBeCloseTo(50, 3);
    expect(bounds[1][1]).toBeCloseTo(30, 3);
    expect(bounds[1][2]).toBeCloseTo(4, 3);

    const mesh = meshShape(solid);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.edges.length).toBeGreaterThan(0);
  });

  it("穴の分だけ体積が減る", () => {
    const plain = buildPlate(solvePlateSketch(gcs, { ...DEFAULT_PARAMS, holeDiameter: 0 }), { thickness: 4, cornerRadius: 0 });
    const holed = buildPlate(solvePlateSketch(gcs, DEFAULT_PARAMS), { thickness: 4, cornerRadius: 0 });
    const volume = (s: typeof plain) => {
      // 体積は三角形メッシュから求める(符号付き四面体の和)
      const m = s.mesh({ tolerance: 0.01, angularTolerance: 5 });
      let v = 0;
      for (let i = 0; i < m.triangles.length; i += 3) {
        const [a, b, c] = [m.triangles[i], m.triangles[i + 1], m.triangles[i + 2]].map((k) => m.vertices.slice(k * 3, k * 3 + 3));
        v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      return Math.abs(v);
    };
    expect(volume(plain)).toBeCloseTo(50 * 30 * 4, 0);
    expect(volume(plain) - volume(holed)).toBeCloseTo(Math.PI * 9 * 4, 0);
  });

  it("STL(バイナリ)を書き出せる", async () => {
    const solid = buildPlate(solvePlateSketch(gcs, DEFAULT_PARAMS), { thickness: 4, cornerRadius: 3 });
    const buf = await solid.blobSTL({ binary: true }).arrayBuffer();
    const triangles = new DataView(buf).getUint32(80, true);
    expect(buf.byteLength).toBe(84 + triangles * 50);
    expect(triangles).toBeGreaterThan(10);
  });
});
