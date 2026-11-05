// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// スケッチを編集する操作。どれも元のスケッチを変えずに、新しいスケッチを返す。
import type { GcsWrapper } from "@salusoft89/planegcs";
import { newId } from "../doc/ids";
import {
  ORIGIN_ID,
  type CurveEntity,
  type Id,
  type SketchConstraint,
  type SketchEntity,
  type SketchFeature,
  type Vec2,
} from "../doc/types";
import { solveSketch, type DragTarget } from "./solver";

/** 置く点: 既存の点にくっつける(id)か、新しい位置(xy) */
export type PointSpec = { id: Id } | { xy: Vec2 };

export type SketchData = Pick<SketchFeature, "entities" | "constraints">;

export interface EditResult {
  ok: boolean;
  sketch: SketchData;
  /** 失敗したときに生徒へ見せる言葉 */
  message?: string;
  dof?: number;
}

/** 水平・垂直とみなす角度(度) */
const HV_TOLERANCE_DEG = 4;

function resolvePoint(spec: PointSpec, added: SketchEntity[]): Id {
  if ("id" in spec) return spec.id;
  const id = newId("p");
  added.push({ id, type: "point", x: spec.xy[0], y: spec.xy[1] });
  return id;
}

export function pointXY(s: SketchData, id: Id): Vec2 {
  if (id === ORIGIN_ID) return [0, 0];
  const e = s.entities.find((x) => x.id === id);
  return e && e.type === "point" ? [e.x, e.y] : [0, 0];
}

function specXY(s: SketchData, spec: PointSpec): Vec2 {
  return "id" in spec ? pointXY(s, spec.id) : spec.xy;
}

/** 線を引く。ほぼ水平・垂直なら、その拘束を自動で付ける(Onshape の自動拘束と同じ) */
export function addLine(s: SketchData, a: PointSpec, b: PointSpec): { sketch: SketchData; lineId: Id; endId: Id } {
  const added: SketchEntity[] = [];
  const cons: SketchConstraint[] = [];
  const p1 = resolvePoint(a, added);
  const p2 = resolvePoint(b, added);
  const lineId = newId("l");
  added.push({ id: lineId, type: "line", p1, p2 });
  const [x1, y1] = specXY(s, a);
  const [x2, y2] = specXY(s, b);
  const ang = (Math.atan2(Math.abs(y2 - y1), Math.abs(x2 - x1)) * 180) / Math.PI;
  if (ang < HV_TOLERANCE_DEG) cons.push({ id: newId("c"), type: "horizontal", line: lineId });
  else if (ang > 90 - HV_TOLERANCE_DEG) cons.push({ id: newId("c"), type: "vertical", line: lineId });
  return { sketch: { entities: [...s.entities, ...added], constraints: [...s.constraints, ...cons] }, lineId, endId: p2 };
}

/** 2つの角を指定して長方形を描く。4辺に水平・垂直の拘束を付ける */
export function addRectangle(s: SketchData, a: PointSpec, b: PointSpec): SketchData {
  const [x1, y1] = specXY(s, a);
  const [x2, y2] = specXY(s, b);
  const added: SketchEntity[] = [];
  const pA = resolvePoint(a, added);
  const pC = resolvePoint(b, added);
  const pB = newId("p");
  const pD = newId("p");
  added.push({ id: pB, type: "point", x: x2, y: y1 }, { id: pD, type: "point", x: x1, y: y2 });
  const l = [newId("l"), newId("l"), newId("l"), newId("l")];
  added.push(
    { id: l[0], type: "line", p1: pA, p2: pB },
    { id: l[1], type: "line", p1: pB, p2: pC },
    { id: l[2], type: "line", p1: pC, p2: pD },
    { id: l[3], type: "line", p1: pD, p2: pA },
  );
  const cons: SketchConstraint[] = [
    { id: newId("c"), type: "horizontal", line: l[0] },
    { id: newId("c"), type: "horizontal", line: l[2] },
    { id: newId("c"), type: "vertical", line: l[1] },
    { id: newId("c"), type: "vertical", line: l[3] },
  ];
  return { entities: [...s.entities, ...added], constraints: [...s.constraints, ...cons] };
}

export function addCircle(s: SketchData, center: PointSpec, r: number): SketchData {
  const added: SketchEntity[] = [];
  const c = resolvePoint(center, added);
  added.push({ id: newId("ci"), type: "circle", c, r: Math.max(r, 0.1) });
  return { entities: [...s.entities, ...added], constraints: s.constraints };
}

/** 文字を置く。位置の点(左下)を作るか、既存の点にくっつける */
export function addText(s: SketchData, at: PointSpec, text: string, size: number): { sketch: SketchData; textId: Id } {
  const added: SketchEntity[] = [];
  const p = resolvePoint(at, added);
  const textId = newId("t");
  added.push({ id: textId, type: "text", p, text, size });
  return { sketch: { entities: [...s.entities, ...added], constraints: s.constraints }, textId };
}

/** 文字の中身や大きさを変える */
export function updateText(s: SketchData, id: Id, patch: { text?: string; size?: number }): SketchData {
  return { entities: s.entities.map((e) => (e.id === id && e.type === "text" ? { ...e, ...patch } : e)), constraints: s.constraints };
}

/** 中心・始点・終点で円弧を描く(始点から反時計回り)。終点は半径に合わせて調整する */
export function addArc(s: SketchData, center: PointSpec, start: PointSpec, end: Vec2): SketchData {
  const added: SketchEntity[] = [];
  const cxy = specXY(s, center);
  const sxy = specXY(s, start);
  const r = Math.max(Math.hypot(sxy[0] - cxy[0], sxy[1] - cxy[1]), 0.1);
  const a0 = Math.atan2(sxy[1] - cxy[1], sxy[0] - cxy[0]);
  let a1 = Math.atan2(end[1] - cxy[1], end[0] - cxy[0]);
  if (a1 <= a0) a1 += Math.PI * 2;
  const c = resolvePoint(center, added);
  const st = resolvePoint(start, added);
  const en = newId("p");
  added.push({ id: en, type: "point", x: cxy[0] + r * Math.cos(a1), y: cxy[1] + r * Math.sin(a1) });
  added.push({ id: newId("a"), type: "arc", c, start: st, end: en, r, a0, a1 });
  return { entities: [...s.entities, ...added], constraints: s.constraints };
}

/**
 * 正多角形。中心と1つの頂点を指定する。
 * 頂点はすべて補助線の円の上にのせ、辺はすべて同じ長さにする。
 */
export function addPolygon(s: SketchData, center: PointSpec, vertex: Vec2, sides: number): SketchData {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const added: SketchEntity[] = [];
  const cons: SketchConstraint[] = [];
  const cxy = specXY(s, center);
  const c = resolvePoint(center, added);
  const r = Math.max(Math.hypot(vertex[0] - cxy[0], vertex[1] - cxy[1]), 0.1);
  const a0 = Math.atan2(vertex[1] - cxy[1], vertex[0] - cxy[0]);
  const circle = newId("ci");
  added.push({ id: circle, type: "circle", c, r, construction: true });
  const pts: Id[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId("p");
    const a = a0 + (2 * Math.PI * i) / n;
    added.push({ id, type: "point", x: cxy[0] + r * Math.cos(a), y: cxy[1] + r * Math.sin(a) });
    cons.push({ id: newId("c"), type: "pointOnCircle", point: id, circle });
    pts.push(id);
  }
  const lines: Id[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId("l");
    added.push({ id, type: "line", p1: pts[i], p2: pts[(i + 1) % n] });
    lines.push(id);
  }
  for (let i = 1; i < n; i++) cons.push({ id: newId("c"), type: "equal", a: lines[0], b: lines[i] });
  return { entities: [...s.entities, ...added], constraints: [...s.constraints, ...cons] };
}

/** 解き直して、点の位置を結果にそろえる */
export function settle(gcs: GcsWrapper, s: SketchData): EditResult {
  const r = solveSketch(gcs, s);
  if (!r.ok) return { ok: false, sketch: s, message: conflictMessage(), dof: -1 };
  return { ok: true, sketch: { entities: r.entities, constraints: s.constraints }, dof: r.dof };
}

/** 拘束や寸法を足す。形が決まりすぎたり矛盾したりするときは、足さずに理由を返す */
export function addConstraint(gcs: GcsWrapper, s: SketchData, c: SketchConstraint): EditResult {
  const next = { entities: s.entities, constraints: [...s.constraints, c] };
  const r = solveSketch(gcs, next);
  if (!r.ok) {
    return {
      ok: false,
      sketch: s,
      message:
        r.redundant.length > 0
          ? "これを入れると形が決まりすぎます。もう決まっているところかもしれません"
          : conflictMessage(),
    };
  }
  return { ok: true, sketch: { entities: r.entities, constraints: next.constraints }, dof: r.dof };
}

/** 寸法の値を変える */
/** 寸法の数を変える。expr は変数を使った式(使わないときは undefined で、前の式も外す) */
export function setDimension(gcs: GcsWrapper, s: SketchData, id: Id, value: number, expr?: string): EditResult {
  const next = {
    entities: s.entities,
    constraints: s.constraints.map((c) => (c.id === id && "value" in c ? { ...c, value, expr } : c)),
  };
  const r = solveSketch(gcs, next);
  if (!r.ok) return { ok: false, sketch: s, message: "この寸法では形が作れません。別の数字にしてみてください" };
  return { ok: true, sketch: { entities: r.entities, constraints: next.constraints }, dof: r.dof };
}

/** 点や線を指でドラッグする。拘束を守ったまま、できるだけ指の位置へ動かす */
export function drag(gcs: GcsWrapper, s: SketchData, target: DragTarget): SketchData | null {
  const r = solveSketch(gcs, s, target);
  return r.ok ? { entities: r.entities, constraints: s.constraints } : null;
}

/**
 * 図形や拘束を消す。点を消すとその点を使う線も消え、
 * 消えた図形を使っている拘束も一緒に消える。
 */
export function deleteItems(s: SketchData, ids: Id[]): SketchData {
  const gone = new Set(ids.filter((i) => i !== ORIGIN_ID));
  // 消える曲線に使われている点のうち、他で使われていない点も消す
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of s.entities) {
      if (gone.has(e.id)) continue;
      const refs = curveRefs(e);
      if (refs.some((r) => gone.has(r))) {
        gone.add(e.id);
        changed = true;
      }
    }
  }
  const usedByRemaining = new Set(s.entities.filter((e) => !gone.has(e.id)).flatMap(curveRefs));
  const usedByGone = new Set(s.entities.filter((e) => gone.has(e.id)).flatMap(curveRefs));
  for (const e of s.entities) {
    if (e.type === "point" && usedByGone.has(e.id) && !usedByRemaining.has(e.id)) gone.add(e.id);
  }
  const entities = s.entities.filter((e) => !gone.has(e.id));
  const constraints = s.constraints.filter((c) => !gone.has(c.id) && !constraintRefs(c).some((r) => gone.has(r)));
  return { entities, constraints };
}

/** 補助線にする/戻す */
export function toggleConstruction(s: SketchData, ids: Id[]): SketchData {
  const set = new Set(ids);
  const curves = s.entities.filter((e) => set.has(e.id) && isCurve(e));
  const makeConstruction = curves.some((e) => !e.construction);
  return {
    entities: s.entities.map((e) => (set.has(e.id) && isCurve(e) ? { ...e, construction: makeConstruction } : e)),
    constraints: s.constraints,
  };
}

export function curveRefs(e: SketchEntity): Id[] {
  switch (e.type) {
    case "line":
      return [e.p1, e.p2];
    case "circle":
      return [e.c];
    case "arc":
      return [e.c, e.start, e.end];
    case "text":
      return [e.p];
    default:
      return [];
  }
}

export function constraintRefs(c: SketchConstraint): Id[] {
  switch (c.type) {
    case "coincident":
    case "parallel":
    case "perpendicular":
    case "equal":
    case "distance":
    case "angle":
      return [c.a, c.b];
    case "horizontal":
    case "vertical":
    case "length":
      return [c.line];
    case "pointOnCircle":
      return [c.point, c.circle];
    case "pointOnLine":
      return [c.point, c.line];
    case "diameter":
      return [c.circle];
  }
}

/** 線・円・円弧(輪郭になるもの)か。点と文字はちがう */
export function isCurve(e: SketchEntity | undefined): e is CurveEntity {
  return !!e && (e.type === "line" || e.type === "circle" || e.type === "arc");
}

function conflictMessage() {
  return "これを入れると形が矛盾します。ほかの寸法や拘束とぶつかっていないか見てください";
}
