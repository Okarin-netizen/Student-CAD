// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { dot3, planeYDir } from "../../doc/planes";
import type { Plane3, Vec2, Vec3 } from "../../doc/types";

const ON_PLANE_MM = 0.01;

/**
 * 立体の輪郭線(xyz の線分の並び)のうち、スケッチ平面の上にあるものを
 * スケッチの座標(x, y の線分の並び)にして返す。
 */
export function edgesOnPlane(edges: Float32Array, plane: Plane3): Float32Array {
  const o = plane.origin;
  const n = plane.normal;
  const x = plane.xDir;
  const y = planeYDir(plane);
  const out: number[] = [];
  const rel = (i: number): Vec3 => [edges[i] - o[0], edges[i + 1] - o[1], edges[i + 2] - o[2]];
  for (let i = 0; i + 5 < edges.length; i += 6) {
    const a = rel(i);
    const b = rel(i + 3);
    if (Math.abs(dot3(a, n)) > ON_PLANE_MM || Math.abs(dot3(b, n)) > ON_PLANE_MM) continue;
    out.push(dot3(a, x), dot3(a, y), dot3(b, x), dot3(b, y));
  }
  return Float32Array.from(out);
}

/** 下がきの線の端の点(重なりは1つにまとめる)。曲線は細かい線分なので、角だけが残るように間引く */
export function referenceCorners(segs: Float32Array): Vec2[] {
  const count = new Map<string, { p: Vec2; dirs: Vec2[] }>();
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const a: Vec2 = [segs[i], segs[i + 1]];
    const b: Vec2 = [segs[i + 2], segs[i + 3]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    for (const [p, dir] of [
      [a, d],
      [b, [-d[0], -d[1]] as Vec2],
    ] as [Vec2, Vec2][]) {
      const k = key(p[0], p[1]);
      const e = count.get(k) ?? { p, dirs: [] };
      e.dirs.push(dir);
      count.set(k, e);
    }
  }
  const out: Vec2[] = [];
  for (const { p, dirs } of count.values()) {
    // 2本の線がほぼまっすぐつながっている点(円の途中など)は角ではない
    if (dirs.length === 2 && dirs[0][0] * dirs[1][0] + dirs[0][1] * dirs[1][1] < -0.95) continue;
    out.push(p);
  }
  return out;
}
