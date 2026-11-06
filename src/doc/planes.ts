// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { add3, cross3, dot3, normalize3, scale3 } from "../math/vec";
import type { BasePlaneName, Plane3, PlaneRef, Vec2, Vec3 } from "./types";

// Onshape と同じ3つの基準面(上・正面・右)。どれも Z が上の世界座標で定義する。
export const BASE_PLANES: Record<BasePlaneName, Plane3> = {
  top: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] },
  front: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] },
  right: { origin: [0, 0, 0], xDir: [0, 1, 0], normal: [1, 0, 0] },
};

export const BASE_PLANE_LABELS: Record<BasePlaneName, string> = {
  top: "上の面",
  front: "正面",
  right: "右の面",
};

export function resolvePlane(ref: PlaneRef): Plane3 {
  if (ref.kind === "base") return BASE_PLANES[ref.name];
  if (ref.kind === "offset") {
    const b = BASE_PLANES[ref.base];
    return { ...b, origin: scale3(b.normal, ref.distance) };
  }
  return ref.plane;
}

/** 平面の名前(「上の面」「上の面から 30mm」など) */
export function planeLabel(ref: PlaneRef): string {
  if (ref.kind === "base") return BASE_PLANE_LABELS[ref.name];
  if (ref.kind === "offset") return `${BASE_PLANE_LABELS[ref.base]}から ${ref.distance}mm`;
  return "立体の面";
}

export function planeYDir(p: Plane3): Vec3 {
  return cross3(p.normal, p.xDir);
}

/** スケッチ上の点 (x, y) を世界座標にする */
export function toWorld(p: Plane3, [x, y]: Vec2): Vec3 {
  return add3(add3(p.origin, scale3(p.xDir, x)), scale3(planeYDir(p), y));
}

/**
 * 立体の平らな面から、スケッチ用の平面を作る。
 * x 方向は、面に沿った向きのうち世界の X(だめなら Y)に一番近いものにする。
 */
export function planeFromFace(origin: Vec3, normal: Vec3): Plane3 {
  const n = normalize3(normal);
  const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = normalize3(add3(ref, scale3(n, -dot3(ref, n))));
  return { origin, xDir: x, normal: n };
}
