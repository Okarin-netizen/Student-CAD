// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// AR 用の立体(2026-11-20 追加): mm → m、Z が上 → Y が上、底の真ん中が原点になっているか
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { arSize, buildArObject, makeUsdz } from "../../src/app/ar/arModel";
import type { BodyMesh } from "../../src/kernel/rebuild";

/** はば 60・おく行き 20・高さ 5(mm)の箱を、原点からずらした所に置いたもの */
function boxMesh(): BodyMesh {
  const g = new THREE.BoxGeometry(60, 20, 5).toNonIndexed();
  g.translate(100, 50, 12.5); // 底は z=10
  const pos = g.getAttribute("position").array as Float32Array;
  const nor = g.getAttribute("normal").array as Float32Array;
  const tri = Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  return { vertices: Float32Array.from(pos), normals: Float32Array.from(nor), triangles: tri, edges: new Float32Array(0), faceGroups: [], edgeGroups: [], faces: [] };
}

describe("AR 用の立体", () => {
  it("実物大(m)で、Y が上、底の真ん中が原点になる", () => {
    const box = new THREE.Box3().setFromObject(buildArObject(boxMesh()));
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.06, 6); // はば 60mm
    expect(size.y).toBeCloseTo(0.005, 6); // 高さ 5mm が上向き(Y)
    expect(size.z).toBeCloseTo(0.02, 6); // おく行き 20mm
    expect(box.min.y).toBeCloseTo(0, 6); // 底が机の高さ
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
  });

  it("元の形(mm)は変えない", () => {
    const mesh = boxMesh();
    const before = mesh.vertices.slice();
    buildArObject(mesh);
    expect(mesh.vertices).toEqual(before);
  });

  it("案内に出す大きさは mm", () => {
    expect(arSize(boxMesh())).toEqual({ width: 60, depth: 20, height: 5 });
  });

  it("iPad 用の USDZ(ZIP の形)を作れる", async () => {
    const bytes = await makeUsdz(buildArObject(boxMesh()));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
