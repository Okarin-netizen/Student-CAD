// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 立体から図面の線(見える線・かくれ線)を作る。
// OpenCascade のかくれ線処理(HLR)で、立体をある向きから見た線を求める。

import { ProjectionCamera, makeProjectedEdges, type Shape3D } from "replicad";
import type { Vec2, Vec3 } from "../doc/types";
import { cross3, distToSegment, dot3, normalize3 } from "../math/vec";

/** 図の種類。技術・家庭科(技術分野)で習う3つ */
export type DrawingKind = "thirdAngle" | "isometric" | "cabinet";

export type ViewName = "front" | "top" | "right" | "isometric" | "cabinet";

/** 1つの向きから見た図。座標は紙の上の mm(実物の大きさ、上が +y) */
export interface ProjectedView {
  name: ViewName;
  visible: Vec2[][];
  hidden: Vec2[][];
  /** 真円に見える穴や丸い形(中心線と直径を入れるのに使う)。第三角法の図だけ */
  circles: { c: Vec2; r: number }[];
  /** 寸法を入れるための形の情報(第三角法の図だけ): まっすぐな辺(見える線もかくれ線も) */
  segments?: [Vec2, Vec2][];
  /** 一周していない円弧(角の丸み・取っ手など)。mid は弧のまん中の点、span は開きの角度(ラジアン) */
  arcs?: { c: Vec2; r: number; mid: Vec2; span: number }[];
}

interface Camera {
  /** 見る人がいる向き(立体からカメラへの向き) */
  toViewer: Vec3;
  /** 紙の右になる向き */
  right: Vec3;
}

/**
 * 第三角法の3つの図。どれも上が高さ(Z)になるようにする。
 * 正面図: 手前(-Y)から見る。平面図: 上(+Z)から見る(紙の上が奥)。右側面図: 右(+X)から見る。
 */
const CAMERAS: Record<"front" | "top" | "right", Camera> = {
  front: { toViewer: [0, -1, 0], right: [1, 0, 0] },
  top: { toViewer: [0, 0, 1], right: [1, 0, 0] },
  right: { toViewer: [1, 0, 0], right: [0, 1, 0] },
};

/** 等角図: 右・手前・上から、3本の軸が 120° ずつに見える向き */
const ISOMETRIC: Camera = { toViewer: [1, -1, 1], right: [1, 1, 0] };

/**
 * 等角投影では長さが √(2/3) 倍に縮むので、学校の「等角図」(軸の方向は実際の長さ)に合わせて戻す。
 */
const ISOMETRIC_SCALE = 1 / Math.sqrt(2 / 3);

/** キャビネット図: 奥行きは 45° 右上に、実際の半分の長さでかく */
const CABINET_K = 0.5 * Math.SQRT1_2;

export function projectViews(body: Shape3D, kind: DrawingKind, withHidden: boolean): ProjectedView[] {
  if (kind === "thirdAngle") {
    // 三面図に、形の感じが分かる等角図(かくれ線なし)を4つ目としてそえる
    const views: ProjectedView[] = (["front", "top", "right"] as const).map((name) => ({ name, ...project(body, CAMERAS[name], withHidden, true) }));
    return [...views, isometricView(body, false)];
  }
  if (kind === "isometric") return [isometricView(body, withHidden)];
  return [{ name: "cabinet", ...cabinet(body, withHidden), circles: [] }];
}

function isometricView(body: Shape3D, withHidden: boolean): ProjectedView {
  const v = project(body, ISOMETRIC, withHidden);
  const s = (lines: Vec2[][]) => lines.map((l) => l.map(([x, y]): Vec2 => [x * ISOMETRIC_SCALE, y * ISOMETRIC_SCALE]));
  return { name: "isometric", visible: s(v.visible), hidden: s(v.hidden), circles: [] };
}

/**
 * キャビネット図。点 (x, y, z) を紙の (x + k·y, z + k·y) にうつす斜めの投影。
 * 斜め投影は「その向きから見た正投影」を紙の上でゆがめたものと同じなので、
 * まず斜めの向きから正投影でかくれ線を求め、そのあと2次元の変換で紙の座標にする。
 */
function cabinet(body: Shape3D, withHidden: boolean) {
  const k = CABINET_K;
  // 紙の上で同じ点になる向き(見る線の向き)は (-k, 1, -k)。カメラはその反対側にいる
  const cam: Camera = { toViewer: [k, -1, k], right: [1, 0, 0] };
  const proj = project(body, cam, withHidden);
  // 2つの点 (1,0,0)→紙(1,0)、(0,0,1)→紙(0,1) から、カメラの座標→紙の座標の変換を求める
  const { u, v } = cameraAxes(cam);
  const [u1, v1] = [u[0], v[0]];
  const [u2, v2] = [u[2], v[2]];
  const det = u1 * v2 - u2 * v1;
  // [a; b] = M [cu; cv]、M は [[u1 u2],[v1 v2]] の逆行列
  const m = [v2 / det, -u2 / det, -v1 / det, u1 / det];
  const map = (lines: Vec2[][]) => lines.map((l) => l.map(([x, y]): Vec2 => [m[0] * x + m[1] * y, m[2] * x + m[3] * y]));
  return { visible: map(proj.visible), hidden: map(proj.hidden) };
}

/** カメラの紙の右(u)と上(v)の向き(OpenCascade の gp_Ax2 と同じ決め方: 上 = 見る人の向き × 右) */
function cameraAxes(cam: Camera): { u: Vec3; v: Vec3 } {
  const n = normalize3(cam.toViewer);
  // right が toViewer と直角でないときは直角にする
  const d = dot3(cam.right, n);
  const u = normalize3([cam.right[0] - n[0] * d, cam.right[1] - n[1] * d, cam.right[2] - n[2] * d]);
  const v = cross3(n, u);
  return { u, v };
}

function project(body: Shape3D, cam: Camera, withHidden: boolean, findCircles = false) {
  const { u } = cameraAxes(cam);
  const camera = new ProjectionCamera([0, 0, 0], normalize3(cam.toViewer), u);
  try {
    // 円はかくれ線でも中心線を入れたいので、かくれ線をかかないときも円を探すために求める
    const { visible, hidden } = makeProjectedEdges(body, camera, withHidden || findCircles);
    const circles = findCircles ? uniqueCircles([...visible, ...hidden]) : [];
    const shown = visible.map(sampleEdge);
    // 見える線と重なるかくれ線はかかない(製図のきまり。重ねると外形が点線のように見える)
    const out = {
      visible: shown,
      hidden: withHidden ? hidden.map(sampleEdge).filter((l) => !coveredBy(l, shown)) : [],
      circles,
      ...(findCircles ? shapeFacts([...visible, ...hidden], circles) : {}),
    };
    for (const e of [...visible, ...hidden]) e.delete();
    return out;
  } finally {
    camera.delete();
  }
}

type ProjectedEdge = ReturnType<typeof makeProjectedEdges>["visible"][number];

/**
 * 円の辺から、紙の上で真円に見える形の中心と半径を求める(同じ円は1つにまとめる)。
 * スケッチで作った穴は、半円2つに分かれた辺になることがあるので、
 * 中心と半径が同じ円弧の長さを足して、一周分になったものを円とみなす。
 */
function uniqueCircles(edges: ProjectedEdge[]): { c: Vec2; r: number }[] {
  const groups: { c: Vec2; r: number; length: number; seen: number[] }[] = [];
  for (const e of edges) {
    if (e.geomType !== "CIRCLE") continue;
    const circle = circleThrough(e.pointAt(0), e.pointAt(0.5), e.pointAt(1));
    // 一周している円は始点と終点が同じなので、途中の点を使い直す
    const c = circle ?? circleThrough(e.pointAt(0), e.pointAt(1 / 3), e.pointAt(2 / 3));
    if (!c || c.r < 1e-6) continue;
    const g = groups.find((o) => Math.hypot(o.c[0] - c.c[0], o.c[1] - c.c[1]) < 1e-4 && Math.abs(o.r - c.r) < 1e-4);
    // 見える線とかくれ線で同じ円弧が2回出ることがあるので、長さと中点で重なりを見分ける
    const mid = e.pointAt(0.5);
    const key = Math.round(Math.atan2(mid.y - c.c[1], mid.x - c.c[0]) * 1e3);
    if (!g) groups.push({ ...c, length: e.length, seen: [key] });
    else if (!g.seen.includes(key)) {
      g.length += e.length;
      g.seen.push(key);
    }
  }
  return groups.filter((g) => Math.abs(g.length - 2 * Math.PI * g.r) < 1e-2 * g.r).map((g) => ({ c: [round(g.c[0]), round(g.c[1])], r: round(g.r) }));
}

/** 寸法を入れるために、まっすぐな辺と、一周していない円弧を集める */
function shapeFacts(edges: ProjectedEdge[], circles: { c: Vec2; r: number }[]) {
  const segments: [Vec2, Vec2][] = [];
  const arcs: { c: Vec2; r: number; mid: Vec2; span: number }[] = [];
  for (const e of edges) {
    const a = e.pointAt(0);
    const b = e.pointAt(1);
    if (e.geomType === "LINE") {
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-3) segments.push([[round(a.x), round(a.y)], [round(b.x), round(b.y)]]);
      continue;
    }
    // 横から見た円(コップの底など)は、曲線でも紙の上ではまっすぐ(たてか横)の線になる
    const pts = Array.from({ length: 17 }, (_, k) => e.pointAt(k / 16));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (x1 - x0 < 1e-3 && y1 - y0 > 1e-3) {
      segments.push([[round(x0), round(y0)], [round(x0), round(y1)]]);
      continue;
    }
    if (y1 - y0 < 1e-3 && x1 - x0 > 1e-3) {
      segments.push([[round(x0), round(y0)], [round(x1), round(y0)]]);
      continue;
    }
    const m = e.pointAt(0.5);
    const c = circleThrough(a, m, b);
    if (!c || c.r < 1e-3) continue;
    // 円として見つけた形(穴など)の一部は、直径で書くので入れない
    if (circles.some((o) => Math.hypot(o.c[0] - c.c[0], o.c[1] - c.c[1]) < 1e-3 && Math.abs(o.r - c.r) < 1e-3)) continue;
    arcs.push({ c: [round(c.c[0]), round(c.c[1])], r: round(c.r), mid: [round(m.x), round(m.y)], span: e.length / c.r });
  }
  return { segments, arcs };
}

/** 3つの点を通る円(点が一直線のときや重なるときは null) */
function circleThrough(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): { c: Vec2; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { c: [x, y], r: Math.hypot(a.x - x, a.y - y) };
}

/** 折れ線 line のどの点も、見える線 others のどれかの上にある(重なっている)か */
function coveredBy(line: Vec2[], others: Vec2[][], tol = 0.02): boolean {
  // 両はしだけだと、外形の上で終わるかくれ線まで消えてしまうので、途中の点も調べる
  const pts = line.flatMap((p, i) => (i === 0 ? [p] : [0.25, 0.5, 0.75, 1].map((t): Vec2 => [line[i - 1][0] + (p[0] - line[i - 1][0]) * t, line[i - 1][1] + (p[1] - line[i - 1][1]) * t])));
  return pts.every((p) => others.some((o) => o.some((a, i) => i > 0 && distToSegment(p, o[i - 1], a) < tol)));
}

/** 辺を折れ線にする。直線は両はしだけ、曲線は細かく分ける */
function sampleEdge(e: ProjectedEdge): Vec2[] {
  const at = (t: number): Vec2 => {
    const p = e.pointAt(t);
    return [round(p.x), round(p.y)];
  };
  if (e.geomType === "LINE") return [at(0), at(1)];
  const n = Math.min(96, Math.max(12, Math.ceil(e.length / 0.8)));
  return Array.from({ length: n + 1 }, (_, i) => at(i / n));
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
