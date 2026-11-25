// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/**
 * スケッチの「立体にできない原因」を見つける。2026-11-25 追加。
 *
 * おかだ さんの依頼「閉じていない線などを表示する」で作った。
 * 前は「閉じていない線があります」と出るだけで、どこが悪いのか中学生には見つけにくかった。
 * ここで場所まで調べ、スケッチの画面で赤い印をつける(SketchEditor.tsx)。
 *
 * 見つけるもの:
 * - はし: ほかの線とつながっていない線のはし(形が閉じていない所)
 * - 線のとちゅうのはし: 見た目は線にくっついているが、線のとちゅうなので形のかどにならない はし
 * - 分かれ道: 3本以上の線が集まる点(どの輪を使うか決められない)
 * - 重なり: 同じ所に2本かいた線・円
 * - 交差: 線どうしが、はしではない所で交わっている所
 * - 近いはし: すき間が小さく、つなげば閉じそうな はしの組(「つなぐ」ボタンで直せる)
 */

import { ORIGIN_ID, type Id, type SketchFeature, type Vec2 } from "../doc/types";

export interface LooseEnd {
  /** はしの点(一致の拘束でまとめた点のうちの1つ) */
  point: Id;
  at: Vec2;
  /** ほかの線のとちゅうに乗っている(見た目はつながっているが、かどにならない) */
  onCurve: boolean;
}

export interface SketchIssues {
  looseEnds: LooseEnd[];
  /** 3本以上の線が集まる点 */
  branches: Vec2[];
  /** 閉じた輪になっていない線(はし・分かれ道をふくむ つながりの線)の id */
  openCurves: Id[];
  /** ほかの線と重なっている線・円の id */
  overlaps: Id[];
  /** 線どうしが、とちゅうで交わっている所 */
  crossings: Vec2[];
  /** つなげば閉じそうな、近い はしの組。gap は すき間(mm) */
  nearPairs: { a: Id; b: Id; gap: number }[];
}

/** 長さをくらべるときの「同じ」とみなす小ささ(mm) */
const EPS = 1e-6;
/** 「線の上に乗っている」とみなす近さ(mm)。図をかくときの吸い付きより十分小さい */
const ON_CURVE = 1e-3;

type Edge = { id: Id; a: Id; b: Id };
type Seg = { id: Id; p: Vec2; q: Vec2 };

/** 一致の拘束でつながった点を、同じ点としてまとめる(findProfiles と同じ考え方) */
export function pointGroups(constraints: SketchFeature["constraints"]): (id: Id) => Id {
  const parent = new Map<Id, Id>();
  const find = (a: Id): Id => {
    let r = a;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const c of constraints) {
    if (c.type !== "coincident") continue;
    const ra = find(c.a);
    const rb = find(c.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return find;
}

/**
 * スケッチを調べて、立体にできない原因の場所を返す。
 * gapLimit は「近いはし」とみなす すき間の上限(mm)。省くと、絵の大きさの 1/4(1mm 以上)にする。
 */
export function checkSketch(sketch: Pick<SketchFeature, "entities" | "constraints">, gapLimit?: number): SketchIssues {
  const pos = new Map<Id, Vec2>([[ORIGIN_ID, [0, 0]]]);
  for (const e of sketch.entities) if (e.type === "point") pos.set(e.id, [e.x, e.y]);
  const find = pointGroups(sketch.constraints);

  // 輪郭に使う線(補助線は使わない)を、点と点をむすぶ辺として集める
  const edges: Edge[] = [];
  const segs: Seg[] = [];
  const circles: { id: Id; c: Vec2; r: number }[] = [];
  const arcs: { id: Id; c: Vec2; r: number; a0: number; a1: number }[] = [];
  for (const e of sketch.entities) {
    if (e.construction) continue;
    if (e.type === "line") {
      edges.push({ id: e.id, a: find(e.p1), b: find(e.p2) });
      segs.push({ id: e.id, p: pos.get(e.p1)!, q: pos.get(e.p2)! });
    } else if (e.type === "arc") {
      edges.push({ id: e.id, a: find(e.start), b: find(e.end) });
      arcs.push({ id: e.id, c: pos.get(e.c)!, r: e.r, a0: e.a0, a1: e.a1 });
    } else if (e.type === "circle") {
      circles.push({ id: e.id, c: pos.get(e.c)!, r: e.r });
    }
  }

  // 点ごとに、何本の線が集まっているか
  const degree = new Map<Id, Id[]>();
  for (const ed of edges) for (const v of [ed.a, ed.b]) degree.set(v, [...(degree.get(v) ?? []), ed.id]);
  const posOf = (group: Id): Vec2 => pos.get(group) ?? [0, 0];

  // はし(1本だけ)と分かれ道(3本以上)
  const looseEnds: LooseEnd[] = [];
  const branches: Vec2[] = [];
  for (const [v, ids] of degree) {
    if (ids.length === 1) {
      const at = posOf(v);
      const onCurve = liesOnOtherCurve(at, ids[0], segs, circles, arcs);
      looseEnds.push({ point: v, at, onCurve });
    } else if (ids.length >= 3) {
      branches.push(posOf(v));
    }
  }

  // ほかの はしと同じ所にある はしは「線のとちゅう」ではなく、つなぎわすれ(近いはしの組で知らせる)
  for (const end of looseEnds) {
    if (end.onCurve && looseEnds.some((o) => o !== end && dist(o.at, end.at) < ON_CURVE)) end.onCurve = false;
  }

  return {
    looseEnds,
    branches,
    openCurves: openCurveIds(edges, degree),
    overlaps: overlapIds(edges, segs, circles),
    crossings: crossingPoints(segs),
    nearPairs: nearEndPairs(looseEnds, gapLimit ?? defaultGapLimit(pos), canJoin(edges, new Set(segs.map((x) => x.id)))),
  };
}

/** 何か1つでも問題があるか */
export function hasIssues(i: SketchIssues): boolean {
  return i.looseEnds.length + i.branches.length + i.overlaps.length + i.crossings.length > 0;
}

/** はし・分かれ道をふくむ つながりの線を、ぜんぶ「閉じていない線」とする */
function openCurveIds(edges: Edge[], degree: Map<Id, Id[]>): Id[] {
  const bad = new Set<Id>();
  for (const [v, ids] of degree) if (ids.length !== 2) bad.add(v);
  if (bad.size === 0) return [];
  // 悪い点から、つながりをたどる
  const byPoint = new Map<Id, Edge[]>();
  for (const ed of edges) for (const v of [ed.a, ed.b]) byPoint.set(v, [...(byPoint.get(v) ?? []), ed]);
  const seen = new Set<Id>();
  const out: Id[] = [];
  const stack = [...bad];
  const visited = new Set<Id>();
  while (stack.length) {
    const v = stack.pop()!;
    if (visited.has(v)) continue;
    visited.add(v);
    for (const ed of byPoint.get(v) ?? []) {
      if (!seen.has(ed.id)) {
        seen.add(ed.id);
        out.push(ed.id);
      }
      stack.push(ed.a, ed.b);
    }
  }
  return out;
}

/** 同じ2点をむすぶ線・同じ線の上で重なる線・同じ円 */
function overlapIds(edges: Edge[], segs: Seg[], circles: { id: Id; c: Vec2; r: number }[]): Id[] {
  const out = new Set<Id>();
  // 同じ2点をむすぶ線(線と円弧の組は、ふくらんだ形になるので重なりではない)
  const segIds = new Set(segs.map((s) => s.id));
  const seenPair = new Map<string, Id>();
  for (const ed of edges) {
    if (!segIds.has(ed.id)) continue;
    const key = [ed.a, ed.b].sort().join("|");
    const other = seenPair.get(key);
    if (other) out.add(other).add(ed.id);
    else seenPair.set(key, ed.id);
  }
  // 同じまっすぐな線の上で、一部が重なる線
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (collinearOverlap(segs[i], segs[j])) out.add(segs[i].id).add(segs[j].id);
    }
  }
  // 中心も半径も同じ円
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const [a, b] = [circles[i], circles[j]];
      if (dist(a.c, b.c) < ON_CURVE && Math.abs(a.r - b.r) < ON_CURVE) out.add(a.id).add(b.id);
    }
  }
  return [...out];
}

function collinearOverlap(s: Seg, t: Seg): boolean {
  const len = dist(s.p, s.q);
  if (len < EPS) return false;
  // t の両はしが s の線(延長をふくむ)の上にあるか
  if (lineDistance(t.p, s) > ON_CURVE || lineDistance(t.q, s) > ON_CURVE) return false;
  // s の向きにならべたとき、重なる長さがあるか
  const along = (p: Vec2) => ((p[0] - s.p[0]) * (s.q[0] - s.p[0]) + (p[1] - s.p[1]) * (s.q[1] - s.p[1])) / len;
  const [t0, t1] = [along(t.p), along(t.q)].sort((a, b) => a - b);
  return Math.min(len, t1) - Math.max(0, t0) > ON_CURVE;
}

/** 線どうしが、どちらのはしでもない所で交わる点 */
function crossingPoints(segs: Seg[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const x = properIntersection(segs[i], segs[j]);
      if (x) out.push(x);
    }
  }
  return out;
}

function properIntersection(s: Seg, t: Seg): Vec2 | null {
  const r: Vec2 = [s.q[0] - s.p[0], s.q[1] - s.p[1]];
  const u: Vec2 = [t.q[0] - t.p[0], t.q[1] - t.p[1]];
  const den = r[0] * u[1] - r[1] * u[0];
  if (Math.abs(den) < EPS) return null; // 平行(重なりは別に調べる)
  const w: Vec2 = [t.p[0] - s.p[0], t.p[1] - s.p[1]];
  const a = (w[0] * u[1] - w[1] * u[0]) / den;
  const b = (w[0] * r[1] - w[1] * r[0]) / den;
  // はしの近く(線の長さの 0.1% 以内)で交わるのは、つながっている所なので数えない
  const m = 1e-3;
  if (a <= m || a >= 1 - m || b <= m || b >= 1 - m) return null;
  return [s.p[0] + r[0] * a, s.p[1] + r[1] * a];
}

/** はしが、自分以外の線・円・円弧の上に乗っているか */
function liesOnOtherCurve(
  at: Vec2,
  self: Id,
  segs: Seg[],
  circles: { id: Id; c: Vec2; r: number }[],
  arcs: { id: Id; c: Vec2; r: number; a0: number; a1: number }[],
): boolean {
  for (const s of segs) if (s.id !== self && segmentDistance(at, s) < ON_CURVE) return true;
  for (const c of circles) if (Math.abs(dist(at, c.c) - c.r) < ON_CURVE) return true;
  for (const a of arcs) {
    if (a.id === self || Math.abs(dist(at, a.c) - a.r) > ON_CURVE) continue;
    if (angleInArc(Math.atan2(at[1] - a.c[1], at[0] - a.c[0]), a.a0, a.a1)) return true;
  }
  return false;
}

/**
 * 2つの はしをつないでも、線がつぶれないかを決める関数を作る。
 * 1本の線の両はしや、まっすぐな線2本だけの「く」の字の両はしをつなぐと、線が重なってしまうのでつながない
 */
function canJoin(edges: Edge[], lineIds: Set<Id>): (a: Id, b: Id) => boolean {
  // 点のつながり(線でむすばれた点どうし)をまとめる
  const parent = new Map<Id, Id>();
  const find = (v: Id): Id => {
    let r = v;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const ed of edges) {
    const [ra, rb] = [find(ed.a), find(ed.b)];
    if (ra !== rb) parent.set(ra, rb);
  }
  const members = new Map<Id, Edge[]>();
  for (const ed of edges) members.set(find(ed.a), [...(members.get(find(ed.a)) ?? []), ed]);
  return (a, b) => {
    if (find(a) !== find(b)) return true;
    const group = members.get(find(a)) ?? [];
    if (group.length <= 1) return false;
    if (group.length === 2 && group.every((ed) => lineIds.has(ed.id))) return false;
    return true;
  };
}

/** それぞれのはしから一番近いはしを探し、すき間が gapLimit 以下の組を返す(1つのはしは1組だけ) */
function nearEndPairs(ends: LooseEnd[], gapLimit: number, joinable: (a: Id, b: Id) => boolean): { a: Id; b: Id; gap: number }[] {
  const cands: { a: Id; b: Id; gap: number }[] = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const gap = dist(ends[i].at, ends[j].at);
      if (gap <= gapLimit && joinable(ends[i].point, ends[j].point)) cands.push({ a: ends[i].point, b: ends[j].point, gap });
    }
  }
  cands.sort((x, y) => x.gap - y.gap);
  const used = new Set<Id>();
  const out: { a: Id; b: Id; gap: number }[] = [];
  for (const c of cands) {
    if (used.has(c.a) || used.has(c.b)) continue;
    used.add(c.a).add(c.b);
    out.push(c);
  }
  return out;
}

function defaultGapLimit(pos: Map<Id, Vec2>): number {
  let min: Vec2 = [Infinity, Infinity];
  let max: Vec2 = [-Infinity, -Infinity];
  for (const [id, p] of pos) {
    if (id === ORIGIN_ID) continue;
    min = [Math.min(min[0], p[0]), Math.min(min[1], p[1])];
    max = [Math.max(max[0], p[0]), Math.max(max[1], p[1])];
  }
  if (!Number.isFinite(min[0])) return 1;
  // 点をタップしたときの吸い付き(画面で 22px)より大きいすき間も拾えるよう、絵の大きさの 1/4 まで
  return Math.max(1, dist(min, max) / 4);
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 点から線(延長をふくむ)までのきょり */
function lineDistance(p: Vec2, s: Seg): number {
  const len = dist(s.p, s.q);
  if (len < EPS) return dist(p, s.p);
  return Math.abs((s.q[0] - s.p[0]) * (s.p[1] - p[1]) - (s.p[0] - p[0]) * (s.q[1] - s.p[1])) / len;
}

/** 点から線分までのきょり */
function segmentDistance(p: Vec2, s: Seg): number {
  const dx = s.q[0] - s.p[0];
  const dy = s.q[1] - s.p[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < EPS ? 0 : Math.min(1, Math.max(0, ((p[0] - s.p[0]) * dx + (p[1] - s.p[1]) * dy) / l2));
  return dist(p, [s.p[0] + dx * t, s.p[1] + dy * t]);
}

/** 角 a が、a0 から反時計回りに a1 までの間にあるか */
function angleInArc(a: number, a0: number, a1: number): boolean {
  const wrap = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return wrap(a - a0) <= wrap(a1 - a0) + 1e-9;
}
