// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { ORIGIN_ID, type Id, type SketchFeature, type Vec2 } from "../doc/types";

/** 閉じた輪郭を作る1本の辺 */
export type LoopSegment =
  | { kind: "line"; from: Vec2; to: Vec2 }
  /** mid は弧の上の中間点(向きに関係なく同じ) */
  | { kind: "arc"; from: Vec2; to: Vec2; mid: Vec2 };

export type Loop =
  | { kind: "circle"; center: Vec2; r: number; polygon: Vec2[]; area: number }
  | { kind: "chain"; segments: LoopSegment[]; polygon: Vec2[]; area: number };

/** 押し出す面1枚 = 外側の輪郭 + 内側の穴 */
export interface Region {
  outer: Loop;
  holes: Loop[];
}

export interface ProfileResult {
  regions: Region[];
  /** 閉じていない線や枝分かれがある(押し出しには使われない) */
  openChains: number;
}

const ARC_STEPS = 32;

/**
 * スケッチから閉じた輪郭を探し、入れ子の関係から「面と穴」を決める。
 * 一番外が面、その内側が穴、そのさらに内側はまた面…(偶奇のルール)。
 * 枝分かれ(1つの点から3本以上)がある部分は、MVPでは対象外にする。
 */
export function findProfiles(sketch: Pick<SketchFeature, "entities" | "constraints">): ProfileResult {
  const pos = new Map<Id, Vec2>([[ORIGIN_ID, [0, 0]]]);
  for (const e of sketch.entities) if (e.type === "point") pos.set(e.id, [e.x, e.y]);

  // 一致拘束でつながった点は同じ点として扱う
  const parent = new Map<Id, Id>();
  const find = (a: Id): Id => {
    let r = a;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const c of sketch.constraints) {
    if (c.type === "coincident") {
      const ra = find(c.a);
      const rb = find(c.b);
      if (ra !== rb) parent.set(ra, rb);
    }
  }

  const loops: Loop[] = [];
  type Edge = { a: Id; b: Id; seg: (fromA: boolean) => LoopSegment };
  const edges: Edge[] = [];

  for (const e of sketch.entities) {
    if (e.construction) continue;
    if (e.type === "circle") {
      const c = pos.get(e.c)!;
      const polygon = circlePolygon(c, e.r, 0, Math.PI * 2);
      loops.push({ kind: "circle", center: c, r: e.r, polygon, area: Math.PI * e.r * e.r });
    } else if (e.type === "line") {
      const p1 = pos.get(e.p1)!;
      const p2 = pos.get(e.p2)!;
      edges.push({ a: find(e.p1), b: find(e.p2), seg: (fromA) => ({ kind: "line", from: fromA ? p1 : p2, to: fromA ? p2 : p1 }) });
    } else if (e.type === "arc") {
      const c = pos.get(e.c)!;
      const s = pos.get(e.start)!;
      const t = pos.get(e.end)!;
      let sweep = e.a1 - e.a0;
      while (sweep <= 0) sweep += Math.PI * 2;
      const midA = e.a0 + sweep / 2;
      const mid: Vec2 = [c[0] + e.r * Math.cos(midA), c[1] + e.r * Math.sin(midA)];
      edges.push({ a: find(e.start), b: find(e.end), seg: (fromA) => ({ kind: "arc", from: fromA ? s : t, to: fromA ? t : s, mid }) });
    }
  }

  // 点ごとのつながり
  const adj = new Map<Id, number[]>();
  edges.forEach((ed, i) => {
    for (const v of [ed.a, ed.b]) adj.set(v, [...(adj.get(v) ?? []), i]);
  });

  const used = new Set<number>();
  let openChains = 0;
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    // この辺を含むつながり全体を集める
    const comp: number[] = [];
    const stack = [i];
    const verts = new Set<Id>();
    while (stack.length) {
      const k = stack.pop()!;
      if (used.has(k)) continue;
      used.add(k);
      comp.push(k);
      for (const v of [edges[k].a, edges[k].b]) {
        verts.add(v);
        for (const n of adj.get(v) ?? []) if (!used.has(n)) stack.push(n);
      }
    }
    const closed = [...verts].every((v) => (adj.get(v) ?? []).length === 2);
    if (!closed) {
      openChains++;
      continue;
    }
    // つながりをたどって輪にする
    const segments: LoopSegment[] = [];
    let cur = comp[0];
    let at = edges[cur].a;
    const visited = new Set<number>();
    while (!visited.has(cur)) {
      visited.add(cur);
      const ed = edges[cur];
      const fromA = ed.a === at;
      segments.push(ed.seg(fromA));
      at = fromA ? ed.b : ed.a;
      const next = (adj.get(at) ?? []).find((n) => n !== cur && !visited.has(n));
      if (next === undefined) break;
      cur = next;
    }
    const polygon = segmentsPolygon(segments);
    loops.push({ kind: "chain", segments, polygon, area: Math.abs(signedArea(polygon)) });
  }

  return { regions: nestRegions(loops), openChains };
}

function nestRegions(loops: Loop[]): Region[] {
  // 大きい順に並べ、それぞれがいくつの輪の内側にあるか(深さ)を数える
  const sorted = [...loops].filter((l) => l.area > 1e-9).sort((a, b) => b.area - a.area);
  const depth = sorted.map(() => 0);
  const parentOf = sorted.map(() => -1);
  for (let i = 0; i < sorted.length; i++) {
    const probe = interiorPoint(sorted[i]);
    for (let j = 0; j < i; j++) {
      if (pointInPolygon(probe, sorted[j].polygon)) {
        depth[i]++;
        // 一番内側(面積が最小)の親を覚える。sorted は大きい順なので後のものほど小さい
        parentOf[i] = j;
      }
    }
  }
  const regions: Region[] = [];
  const regionIndex = new Map<number, number>();
  sorted.forEach((loop, i) => {
    if (depth[i] % 2 === 0) {
      regionIndex.set(i, regions.length);
      regions.push({ outer: loop, holes: [] });
    }
  });
  sorted.forEach((loop, i) => {
    if (depth[i] % 2 === 1 && parentOf[i] >= 0) {
      const r = regionIndex.get(parentOf[i]);
      if (r !== undefined) regions[r].holes.push(loop);
    }
  });
  return regions;
}

/** 輪の内側にある点(多角形の頂点は他の輪の境界に乗っていることがあるので、少し内側に寄せる) */
function interiorPoint(loop: Loop): Vec2 {
  if (loop.kind === "circle") return loop.center;
  const poly = loop.polygon;
  const [a, b] = [poly[0], poly[1]];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const eps = Math.max(1e-4, Math.sqrt(loop.area) * 1e-3);
  const p1: Vec2 = [mx + nx * eps, my + ny * eps];
  return pointInPolygon(p1, poly) ? p1 : [mx - nx * eps, my - ny * eps];
}

export function pointInPolygon([x, y]: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return -a / 2;
}

function circlePolygon(c: Vec2, r: number, a0: number, sweep: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < ARC_STEPS; i++) {
    const a = a0 + (sweep * i) / ARC_STEPS;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

function segmentsPolygon(segments: LoopSegment[]): Vec2[] {
  const pts: Vec2[] = [];
  for (const s of segments) {
    pts.push(s.from);
    if (s.kind === "arc") {
      // 3点を通る円を求めて、弧の上の点を足す
      const arc = arcThrough(s.from, s.mid, s.to);
      if (arc) for (let i = 1; i < 8; i++) pts.push(arc(i / 8));
    }
  }
  return pts;
}

/** 3点を通る弧を t∈[0,1] で返す関数 */
export function arcThrough(a: Vec2, m: Vec2, b: Vec2): ((t: number) => Vec2) | null {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-12) return null;
  const sq = (p: Vec2) => p[0] * p[0] + p[1] * p[1];
  const cx = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d;
  const cy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d;
  const r = Math.hypot(a[0] - cx, a[1] - cy);
  const ang = (p: Vec2) => Math.atan2(p[1] - cy, p[0] - cx);
  const a0 = ang(a);
  let am = ang(m) - a0;
  let ab = ang(b) - a0;
  const wrap = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  am = wrap(am);
  ab = wrap(ab);
  // m が a→b の反時計回りの間にあれば反時計回り、なければ時計回り
  const sweep = am < ab ? ab : ab - 2 * Math.PI;
  return (t) => [cx + r * Math.cos(a0 + sweep * t), cy + r * Math.sin(a0 + sweep * t)];
}
