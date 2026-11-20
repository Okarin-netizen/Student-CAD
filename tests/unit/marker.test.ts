// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// マーカーAR(2026-11-20 追加): マーカーを見つけられるか、位置と向きが正しいか
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FOCAL_RATIO, MarkerTracker } from "../../src/app/ar/markerTracker";
import { MARKER_MM, markerCells, markerSheetSvg } from "../../src/app/ar/markerSheet";

const W = 640;
const H = 480;
const F = W * FOCAL_RATIO;

/** 本当の向き(マーカー → カメラ)で、マーカーの 4 すみが画面のどこに写るか */
function project(m: THREE.Matrix4): { x: number; y: number }[] {
  const h = MARKER_MM / 2;
  return [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ].map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(m);
    return { x: W / 2 + (F * p.x) / -p.z, y: H / 2 - (F * p.y) / -p.z };
  });
}

/** 正面から写したマーカーの絵(RGBA)。黒い四角の 1 辺は side px */
function frontImage(side: number): Uint8ClampedArray {
  const img = new Uint8ClampedArray(W * H * 4).fill(255);
  const cells = markerCells();
  const unit = side / cells.length;
  const x0 = (W - side) / 2;
  const y0 = (H - side) / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cx = Math.floor((x - x0) / unit);
      const cy = Math.floor((y - y0) / unit);
      const inside = cx >= 0 && cy >= 0 && cx < cells.length && cy < cells.length;
      if (inside && !cells[cy][cx]) img.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
    }
  return img;
}

describe("マーカーAR", () => {
  it("マーカーは 8×8 マス(外がわ 1 マスは黒いふち)", () => {
    const cells = markerCells();
    expect(cells).toHaveLength(8);
    expect(cells[0].every((w) => !w)).toBe(true);
    expect(cells.flat().some((w) => w)).toBe(true);
  });

  it("4 すみの位置から、マーカーの位置と向きをもとにもどせる(机にななめに置いたとき)", () => {
    const truth = new THREE.Matrix4().compose(
      new THREE.Vector3(30, -40, -450),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0.3, 0.2)),
      new THREE.Vector3(1, 1, 1),
    );
    const got = new MarkerTracker(W, H).poseFromCorners(project(truth));
    const a = truth.elements;
    const b = got.elements;
    for (let i = 0; i < 16; i++) expect(b[i]).toBeCloseTo(a[i], i % 4 === 3 || i >= 12 ? 0 : 1);
    // 裏返し(鏡)になっていない
    expect(got.determinant()).toBeGreaterThan(0);
  });

  it("正面のマーカーの絵から、マーカーを見つけて きょりを出せる", () => {
    const side = 200;
    const pose = new MarkerTracker(W, H).detect(frontImage(side));
    expect(pose).not.toBeNull();
    const pos = new THREE.Vector3().setFromMatrixPosition(pose!);
    // 100mm の四角が 200px に写るきょり = F × 100 / 200
    expect(-pos.z).toBeCloseTo((F * MARKER_MM) / side, -1);
    // 紙の表(z)はカメラの方を向く
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(pose!);
    expect(normal.z).toBeGreaterThan(0.95);
  });

  it("マーカーのない絵では見つからない", () => {
    expect(new MarkerTracker(W, H).detect(new Uint8ClampedArray(W * H * 4).fill(255))).toBeNull();
  });

  it("印刷用シートは A4 たて", () => {
    const svg = markerSheetSvg();
    expect(svg).toContain('width="210mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain("10cm");
  });
});
