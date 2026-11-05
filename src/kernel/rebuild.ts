// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { FaceFinder, Plane, draw, genericSweep, drawCircle, drawText, getFont, type Drawing, type Shape3D } from "replicad";
import type { GcsWrapper } from "@salusoft89/planegcs";
import type {
  CadDocument,
  ExtrudeOperation,
  FilletFeature,
  Id,
  MirrorFeature,
  PatternFeature,
  Plane3,
  RevolveAxis,
  ShellFeature,
  SketchFeature,
  Vec2,
  Vec3,
  WorldAxis,
} from "../doc/types";
import { BASE_PLANES, cross3, dot3, normalize3, resolvePlane, scale3, toWorld } from "../doc/planes";
import { pointPos, solveSketch } from "../sketch/solver";
import { arcThrough, findProfiles, type Loop, type Region } from "../sketch/profiles";

export type FeatureStatus = { id: Id; ok: true; warning?: string } | { id: Id; ok: false; error: string };

export interface BodyMesh {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  edges: Float32Array;
  /** 三角形の範囲ごとの面の番号 */
  faceGroups: { start: number; count: number; face: number }[];
  /** 辺ごとの線分の範囲(edges の中の線分の番号)と、辺の真ん中の点 */
  edgeGroups: { start: number; count: number; mid: Vec3 }[];
  /** 面ごとの情報(平らな面ならスケッチ平面にできる) */
  faces: ({ planar: true; origin: Vec3; normal: Vec3 } | { planar: false })[];
}

export interface SketchDisplay {
  featureId: Id;
  /** 世界座標の線分(xyz を2点ずつ) */
  lines: Float32Array;
  /** 押し出しに使われているか(使われていれば 3D では隠す) */
  consumed: boolean;
}

export interface RebuildOutput {
  statuses: FeatureStatus[];
  body: Shape3D | null;
  sketches: SketchDisplay[];
}

export const MESH_OPTIONS = { tolerance: 0.05, angularTolerance: 12 };

/** 文字に使うフォントの名前(Worker で loadFont するときと同じ名前にする) */
export const TEXT_FONT = "student-text";

/** パターンで作れる数の上限(多すぎると計算に時間がかかりすぎるため) */
export const PATTERN_MAX = 100;

/**
 * 作業ごとの「道具」の形と、それをくっつけたか・けずったか。
 * ミラーとパターンは、この道具を写して使う。
 */
interface ToolShape {
  shape: Shape3D;
  operation: ExtrudeOperation;
}

/** 設計図にスケッチの文字があるか(あれば、計算の前にフォントを読み込む) */
export function usesText(doc: CadDocument): boolean {
  return doc.features.some((f) => f.type === "sketch" && f.entities.some((e) => e.type === "text" && e.text.trim() !== ""));
}

/**
 * 作業のれきしを頭から順に実行して、形を作り直す。
 * 途中の作業が失敗しても、そこで止めずに印を付けて次へ進む(Onshape と同じ)。
 */
export function rebuild(doc: CadDocument, gcs: GcsWrapper): RebuildOutput {
  const statuses: FeatureStatus[] = [];
  const solvedSketches = new Map<Id, SketchFeature>();
  const consumed = new Set<Id>();
  const tools = new Map<Id, ToolShape>();
  let body: Shape3D | null = null;

  for (const f of doc.features) {
    if (f.type === "sketch") {
      const res = solveSketch(gcs, f);
      solvedSketches.set(f.id, res.ok ? { ...f, entities: res.entities } : f);
      statuses.push(res.ok ? { id: f.id, ok: true } : { id: f.id, ok: false, error: "スケッチの寸法や拘束が矛盾しています" });
      continue;
    }

    if (f.type === "fillet") {
      if (!body) {
        statuses.push({ id: f.id, ok: false, error: "丸める立体がまだありません" });
        continue;
      }
      const r = applyFillet(body, f);
      if (r.ok) body = r.body;
      statuses.push(r.ok ? { id: f.id, ok: true, warning: r.warning } : { id: f.id, ok: false, error: r.error });
      continue;
    }

    if (f.type === "mirror" || f.type === "pattern") {
      const r: CopyResult = f.type === "mirror" ? applyMirror(body, tools, f) : applyPattern(body, tools, f);
      if (r.ok) {
        body = r.body;
        tools.set(f.id, r.tool);
        statuses.push({ id: f.id, ok: true, warning: r.warning });
      } else {
        statuses.push({ id: f.id, ok: false, error: r.error });
      }
      continue;
    }

    if (f.type === "shell") {
      if (!body) {
        statuses.push({ id: f.id, ok: false, error: "くりぬく立体がまだありません" });
        continue;
      }
      const r = applyShell(body, f);
      if (r.ok) body = r.body;
      statuses.push(r.ok ? { id: f.id, ok: true } : { id: f.id, ok: false, error: r.error });
      continue;
    }

    if (f.type === "loft") {
      const r = loftSketches(f.sketchIds.map((id) => solvedSketches.get(id)));
      if (!r.ok) {
        statuses.push({ id: f.id, ok: false, error: r.error });
        continue;
      }
      for (const id of f.sketchIds) consumed.add(id);
      if (f.operation === "cut" && !body) {
        statuses.push({ id: f.id, ok: false, error: "けずる立体がまだありません" });
        continue;
      }
      try {
        const tool = r.make(f.ruled);
        tools.set(f.id, { shape: tool, operation: f.operation });
        body = combine(body, { shape: tool, operation: f.operation });
        statuses.push({ id: f.id, ok: true });
      } catch (err) {
        console.warn(err);
        statuses.push({ id: f.id, ok: false, error: "この形はつなげませんでした。形の向きや大きさを変えてみてください" });
      }
      continue;
    }

    if (f.type === "sweep") {
      const r = sweepSketches(solvedSketches.get(f.pathId), solvedSketches.get(f.profileId));
      if (!r.ok) {
        statuses.push({ id: f.id, ok: false, error: r.error });
        continue;
      }
      consumed.add(f.pathId);
      consumed.add(f.profileId);
      if (f.operation === "cut" && !body) {
        statuses.push({ id: f.id, ok: false, error: "けずる立体がまだありません" });
        continue;
      }
      try {
        const tool = r.make();
        tools.set(f.id, { shape: tool, operation: f.operation });
        body = combine(body, { shape: tool, operation: f.operation });
        statuses.push({ id: f.id, ok: true });
      } catch (err) {
        console.warn(err);
        statuses.push({ id: f.id, ok: false, error: "この形はなぞれませんでした。道すじの曲がり方をゆるくするか、断面を小さくしてみてください" });
      }
      continue;
    }

    // 押し出し・回転
    const sketch = solvedSketches.get(f.sketchId);
    if (!sketch) {
      statuses.push({ id: f.id, ok: false, error: "使うスケッチが見つかりません" });
      continue;
    }
    consumed.add(sketch.id);
    try {
      const { regions, openChains } = findProfiles(sketch);
      const texts = f.type === "extrude" ? sketchTexts(sketch) : [];
      if (regions.length === 0 && texts.length === 0) {
        statuses.push({
          id: f.id,
          ok: false,
          error: f.type === "revolve" && sketchTexts(sketch).length > 0 ? "文字は回転できません。押し出しを使ってください" : "スケッチに閉じた形がありません。線のはしをつなげてください",
        });
        continue;
      }
      if (texts.length > 0 && !getFont(TEXT_FONT)) {
        statuses.push({ id: f.id, ok: false, error: "文字の形(フォント)を読み込めませんでした。ネットにつないで、ページを読み込み直してください" });
        continue;
      }
      const plane = resolvePlane(sketch.plane);
      let tool: Shape3D;
      if (f.type === "extrude") {
        if (f.distance <= 0) {
          statuses.push({ id: f.id, ok: false, error: "長さは 0 より大きくしてください" });
          continue;
        }
        tool = extrudeRegions(regions, plane, f.distance, f.operation === "cut" ? !f.flip : f.flip, texts);
      } else {
        const axis = revolveAxis(sketch, f.axis);
        if (!axis) {
          statuses.push({ id: f.id, ok: false, error: "回す軸にする線が見つかりません" });
          continue;
        }
        if (f.angle <= 0 || f.angle > 360) {
          statuses.push({ id: f.id, ok: false, error: "角度は 0 より大きく 360 以下にしてください" });
          continue;
        }
        if (crossesAxis(regions, axis)) {
          statuses.push({ id: f.id, ok: false, error: "形が軸の両側にあります。軸の片側だけに形をかいてください" });
          continue;
        }
        tool = revolveRegions(regions, plane, axis, f.flip ? -f.angle : f.angle);
      }
      tools.set(f.id, { shape: tool, operation: f.operation });
      if (f.operation === "add") {
        body = body ? body.fuse(tool) : tool;
      } else {
        if (!body) {
          statuses.push({ id: f.id, ok: false, error: "けずる立体がまだありません" });
          continue;
        }
        body = body.cut(tool);
      }
      statuses.push(
        openChains > 0
          ? { id: f.id, ok: true, warning: "閉じていない線は使いませんでした" }
          : { id: f.id, ok: true },
      );
    } catch (err) {
      statuses.push({ id: f.id, ok: false, error: "この形は作れませんでした。寸法を少し変えてみてください" });
      console.warn(err);
    }
  }

  const sketches: SketchDisplay[] = [...solvedSketches.values()].map((s) => ({
    featureId: s.id,
    lines: sketchLines(s),
    consumed: consumed.has(s.id),
  }));
  return { statuses, body, sketches };
}

/** スケッチの文字(スケッチの座標の、左下の位置と大きさ) */
export interface SketchText {
  text: string;
  size: number;
  at: Vec2;
}

export function sketchTexts(sketch: SketchFeature): SketchText[] {
  return sketch.entities.flatMap((e) => {
    if (e.type !== "text" || e.text.trim() === "" || e.size <= 0) return [];
    return [{ text: e.text, size: e.size, at: pointPos(sketch.entities, e.p) }];
  });
}

/** 面(と穴)と文字をまとめて押し出した立体を作る。reverse なら面の裏側へ押し出す */
export function extrudeRegions(regions: Region[], plane: Plane3, distance: number, reverse: boolean, texts: SketchText[] = []): Shape3D {
  let drawing: Drawing | null = null;
  for (const r of regions) {
    let d = loopDrawing(r.outer);
    for (const h of r.holes) d = d.cut(loopDrawing(h));
    drawing = drawing ? drawing.fuse(d) : d;
  }
  for (const t of texts) {
    const d = drawText(t.text, { startX: t.at[0], startY: t.at[1], fontSize: t.size, fontFamily: TEXT_FONT });
    drawing = drawing ? drawing.fuse(d) : d;
  }
  const rp = new Plane(plane.origin, plane.xDir, plane.normal);
  const sketch = drawing!.sketchOnPlane(rp);
  const dir = scale3(plane.normal, reverse ? -1 : 1);
  return (sketch as { extrude: (d: number, o?: object) => unknown }).extrude(distance, { extrusionDirection: dir }) as Shape3D;
}

/** スケッチの座標での回転軸(点と向き) */
export interface Axis2 {
  p: Vec2;
  d: Vec2;
}

export function revolveAxis(sketch: SketchFeature, axis: RevolveAxis): Axis2 | null {
  if (axis.kind === "x") return { p: [0, 0], d: [1, 0] };
  if (axis.kind === "y") return { p: [0, 0], d: [0, 1] };
  const line = sketch.entities.find((e) => e.id === axis.line);
  if (line?.type !== "line") return null;
  const a = pointPos(sketch.entities, line.p1);
  const b = pointPos(sketch.entities, line.p2);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 1e-6) return null;
  return { p: a, d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
}

/** 形が軸の両側にまたがっていないか(またがると回した形が自分と重なって作れない) */
export function crossesAxis(regions: Region[], axis: Axis2): boolean {
  let pos = false;
  let neg = false;
  for (const r of regions) {
    for (const p of r.outer.polygon) {
      const side = (p[0] - axis.p[0]) * axis.d[1] - (p[1] - axis.p[1]) * axis.d[0];
      if (side > 1e-6) pos = true;
      if (side < -1e-6) neg = true;
    }
  }
  return pos && neg;
}

/** 面を軸のまわりに回した立体 */
export function revolveRegions(regions: Region[], plane: Plane3, axis: Axis2, angleDeg: number): Shape3D {
  const rp = new Plane(plane.origin, plane.xDir, plane.normal);
  const origin = toWorld(plane, axis.p);
  const tip = toWorld(plane, [axis.p[0] + axis.d[0], axis.p[1] + axis.d[1]]);
  const dir: Vec3 = [tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2]];
  let out: Shape3D | null = null;
  for (const r of regions) {
    let d = loopDrawing(r.outer);
    for (const h of r.holes) d = d.cut(loopDrawing(h));
    const sk = d.sketchOnPlane(rp) as unknown as { revolve: (axis: Vec3, o: { origin: Vec3; angle: number }) => Shape3D };
    const solid = sk.revolve(angleDeg < 0 ? (dir.map((v) => -v) as Vec3) : dir, { origin, angle: Math.abs(angleDeg) });
    out = out ? out.fuse(solid) : solid;
  }
  return out!;
}

// ---- ミラー・パターン ----

type CopyResult = { ok: true; body: Shape3D; tool: ToolShape; warning?: string } | { ok: false; error: string };

/** 2つの形の外側の箱が同じか */
function sameBounds(a: Shape3D, b: Shape3D): boolean {
  const [la, ha] = a.boundingBox.bounds;
  const [lb, hb] = b.boundingBox.bounds;
  return [0, 1, 2].every((i) => Math.abs(la[i] - lb[i]) < 1e-4 && Math.abs(ha[i] - hb[i]) < 1e-4);
}

const AXIS_VECTORS: Record<WorldAxis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** 道具の形を体にくっつける、またはけずる */
function combine(body: Shape3D | null, tool: ToolShape): Shape3D | null {
  if (tool.operation === "add") return body ? body.fuse(tool.shape) : tool.shape;
  return body ? body.cut(tool.shape) : null;
}

export function applyMirror(body: Shape3D | null, tools: Map<Id, ToolShape>, f: MirrorFeature): CopyResult {
  if (!body) return { ok: false, error: "対称にする立体がまだありません" };
  const normal = BASE_PLANES[f.plane].normal;
  try {
    if (f.source === "body") {
      const mirrored = body.clone().mirror(normal, [0, 0, 0]);
      const fused = body.fuse(mirrored);
      // 写した形が元と同じ場所なら(もう対称なら)、見た目は変わらないので知らせる
      const warning = sameBounds(body, fused) ? "もう対称なので、形は変わりませんでした。鏡にする面を変えるか、形を原点の片側にかいてください" : undefined;
      return { ok: true, body: fused, tool: { shape: mirrored, operation: "add" }, warning };
    }
    const src = tools.get(f.source);
    if (!src) return { ok: false, error: "対称にする作業がうまくできていません。先にそちらを直してください" };
    const mirrored: ToolShape = { shape: src.shape.clone().mirror(normal, [0, 0, 0]), operation: src.operation };
    return { ok: true, body: combine(body, mirrored)!, tool: mirrored };
  } catch (err) {
    console.warn(err);
    return { ok: false, error: "対称にできませんでした。鏡にする面を変えてみてください" };
  }
}

export function applyPattern(body: Shape3D | null, tools: Map<Id, ToolShape>, f: PatternFeature): CopyResult {
  const src = tools.get(f.source);
  if (!src) return { ok: false, error: "ならべる作業がうまくできていません。先にそちらを直してください" };
  if (!Number.isInteger(f.count) || f.count < 2) return { ok: false, error: "数は 2 以上にしてください" };
  const count2 = f.kind === "linear" ? Math.max(1, Math.round(f.count2)) : 1;
  if (f.count * count2 > PATTERN_MAX) return { ok: false, error: `ならべる数は全部で ${PATTERN_MAX} こまでにしてください` };
  if (f.kind === "linear" && (f.spacing <= 0 || (count2 > 1 && f.spacing2 <= 0))) return { ok: false, error: "間かくは 0 より大きくしてください" };
  if (f.kind === "circular" && (f.angle <= 0 || f.angle > 360)) return { ok: false, error: "角度は 0 より大きく 360 以下にしてください" };

  try {
    let copies: Shape3D | null = null;
    const add = (s: Shape3D) => (copies = copies ? copies.fuse(s) : s);
    if (f.kind === "linear") {
      const d1 = scale3(AXIS_VECTORS[f.axis], (f.flip ? -1 : 1) * f.spacing);
      const d2 = scale3(AXIS_VECTORS[f.axis2], f.spacing2);
      for (let i = 0; i < f.count; i++) {
        for (let j = 0; j < count2; j++) {
          if (i === 0 && j === 0) continue;
          add(src.shape.clone().translate([d1[0] * i + d2[0] * j, d1[1] * i + d2[1] * j, d1[2] * i + d2[2] * j]));
        }
      }
    } else {
      // 一周(360°)なら最後が最初と重なるので、数で割る。それ以外は両はしを含めて割る
      const step = f.angle >= 360 ? 360 / f.count : f.angle / (f.count - 1);
      for (let i = 1; i < f.count; i++) add(src.shape.clone().rotate(step * i, [0, 0, 0], AXIS_VECTORS[f.axis]));
    }
    const tool: ToolShape = { shape: copies!, operation: src.operation };
    const next = combine(body, tool);
    if (!next) return { ok: false, error: "けずる立体がまだありません" };
    return { ok: true, body: next, tool: { shape: src.shape.fuse(copies!), operation: src.operation } };
  } catch (err) {
    console.warn(err);
    return { ok: false, error: "ならべられませんでした。間かくや数を変えてみてください" };
  }
}

/** 辺の目印から、いまの立体で一番近い辺を探すときの許し(mm) */
const EDGE_MATCH_MM = 1.5;

type FilletResult = { ok: true; body: Shape3D; warning?: string } | { ok: false; error: string };

export function applyFillet(body: Shape3D, f: FilletFeature): FilletResult {
  if (f.edges.length === 0) return { ok: false, error: "丸める辺をタップしてえらんでください" };
  if (f.radius <= 0) return { ok: false, error: "大きさは 0 より大きくしてください" };
  // 目印ごとに一番近い辺を1本ずつ選ぶ
  const edges = body.edges;
  const chosen = new Set<number>();
  let missing = 0;
  for (const ref of f.edges) {
    let best = -1;
    let bestD = EDGE_MATCH_MM;
    edges.forEach((e, i) => {
      const d = distToEdge(e, ref.mid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) chosen.add(best);
    else missing++;
  }
  if (chosen.size === 0) return { ok: false, error: "えらんだ辺が見つかりません。形が変わったので、辺をえらび直してください" };
  const picked = [...chosen].map((i) => edges[i]);
  const isPicked = (e: { pointAt: (t: number) => { x: number; y: number; z: number } }) => {
    const m = e.pointAt(0.5);
    return picked.some((p) => {
      const q = p.pointAt(0.5);
      return Math.hypot(m.x - q.x, m.y - q.y, m.z - q.z) < 1e-6;
    });
  };
  try {
    const radius = (e: Parameters<typeof isPicked>[0]) => (isPicked(e) ? f.radius : null);
    const out = f.kind === "fillet" ? body.fillet(radius as never) : body.chamfer(radius as never);
    if (!out || out === body) throw new Error("no change");
    const warning = missing > 0 ? `${missing} 本の辺が見つからなかったので、残りの辺だけ${f.kind === "fillet" ? "丸めました" : "落としました"}` : undefined;
    return { ok: true, body: out, warning };
  } catch (err) {
    console.warn(err);
    return { ok: false, error: `${f.kind === "fillet" ? "丸め" : "面取り"}の大きさが大きすぎるようです。小さくしてみてください` };
  }
}

function distToEdge(e: { pointAt: (t: number) => { x: number; y: number; z: number } }, p: Vec3): number {
  let best = Infinity;
  for (let i = 0; i <= 16; i++) {
    const q = e.pointAt(i / 16);
    best = Math.min(best, Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]));
  }
  return best;
}

type LoftPrep = { ok: true; make: (ruled: boolean) => Shape3D } | { ok: false; error: string };

/**
 * ロフトの準備。どのスケッチも「閉じた形が1つ、穴なし」で、平面がちがうことを確かめる。
 * 形はスケッチの順につなぐ。
 */
export function loftSketches(sketches: (SketchFeature | undefined)[]): LoftPrep {
  if (sketches.length < 2) return { ok: false, error: "つなぐスケッチを2つ以上えらんでください" };
  const loops: { loop: Loop; plane: Plane3 }[] = [];
  for (const sk of sketches) {
    if (!sk) return { ok: false, error: "使うスケッチが見つかりません" };
    const { regions } = findProfiles(sk);
    if (regions.length !== 1 || regions[0].holes.length > 0) {
      return { ok: false, error: `「${sk.name}」には、閉じた形を1つだけ(穴なしで)かいてください` };
    }
    loops.push({ loop: regions[0].outer, plane: resolvePlane(sk.plane) });
  }
  for (let i = 1; i < loops.length; i++) {
    const a = loops[i - 1].plane;
    const b = loops[i].plane;
    const d: Vec3 = [b.origin[0] - a.origin[0], b.origin[1] - a.origin[1], b.origin[2] - a.origin[2]];
    const gap = dot3(d, a.normal);
    if (Math.abs(gap) < 1e-6 && Math.abs(dot3(a.normal, b.normal)) > 1 - 1e-9) {
      return { ok: false, error: "同じ面にかいたスケッチはつなげません。「面をずらす」で高さのちがう面にかいてください" };
    }
  }
  return {
    ok: true,
    make: (ruled) => {
      const [first, ...rest] = loops.map(({ loop, plane }) => loopDrawing(loop).sketchOnPlane(new Plane(plane.origin, plane.xDir, plane.normal)));
      return (first as unknown as { loftWith: (o: unknown[], c: object) => Shape3D }).loftWith(rest, { ruled });
    },
  };
}

type SweepPrep = { ok: true; make: () => Shape3D } | { ok: false; error: string };

/**
 * なぞるの準備。道すじは閉じていない線1本、断面は閉じた形1つ(穴なし)。
 * 断面は、そのスケッチの原点のまわりにかいた形を、道すじのはじめの点に、道すじと直角になるように置く。
 * (中学生が「道すじのはじめの点を通る面」を自分で用意しなくてよいように)
 * 断面のたての向きは、道すじをかいた面の法線(上の面にかいた道すじなら、高さの向き)にそろえる。
 */
export function sweepSketches(path: SketchFeature | undefined, profile: SketchFeature | undefined): SweepPrep {
  if (!path || !profile) return { ok: false, error: "使うスケッチが見つかりません" };
  if (path.id === profile.id) return { ok: false, error: "道すじと断面は、べつのスケッチにしてください" };
  const { paths } = findProfiles(path);
  if (paths.length !== 1) return { ok: false, error: `「${path.name}」には、閉じていない線を1本(枝分かれなし)かいてください` };
  const { regions } = findProfiles(profile);
  if (regions.length !== 1 || regions[0].holes.length > 0) return { ok: false, error: `「${profile.name}」には、閉じた形を1つだけ(穴なしで)かいてください` };
  const pathPlane = resolvePlane(path.plane);
  const segs = paths[0];
  const first = segs[0];
  // はじめの点での道すじの向き(スケッチの座標)
  let dir2: Vec2 = [first.to[0] - first.from[0], first.to[1] - first.from[1]];
  if (first.kind === "arc") {
    const at = arcThrough(first.from, first.mid, first.to);
    if (at) {
      const q = at(1e-3);
      dir2 = [q[0] - first.from[0], q[1] - first.from[1]];
    }
  }
  const start = toWorld(pathPlane, first.from);
  const tip = toWorld(pathPlane, [first.from[0] + dir2[0], first.from[1] + dir2[1]]);
  const n = normalize3([tip[0] - start[0], tip[1] - start[1], tip[2] - start[2]]);
  const x = normalize3(cross3(pathPlane.normal, n));
  return {
    ok: true,
    make: () => {
      let pen = draw(first.from);
      for (const sg of segs) pen = sg.kind === "line" ? pen.lineTo(sg.to) : pen.threePointsArcTo(sg.to, sg.mid);
      const spine = (pen.done() as unknown as { sketchOnPlane: (p: Plane) => { wire: unknown } }).sketchOnPlane(new Plane(pathPlane.origin, pathPlane.xDir, pathPlane.normal)).wire;
      const wire = (loopDrawing(regions[0].outer).sketchOnPlane(new Plane(start, x, n)) as unknown as { wire: unknown }).wire;
      type W = Parameters<typeof genericSweep>[0];
      return genericSweep(wire as W, spine as W, { frenet: true }, false);
    },
  };
}

type ShellResult = { ok: true; body: Shape3D } | { ok: false; error: string };

/** くりぬく。えらんだ面(タップした点をふくむ面)を取りのぞいて、thickness のあつさのからにする */
export function applyShell(body: Shape3D, f: ShellFeature): ShellResult {
  if (f.thickness <= 0) return { ok: false, error: "あつさは 0 より大きくしてください" };
  if (f.faces.length === 0) return { ok: false, error: "取りのぞく面を、3D でタップしてえらんでください" };
  // えらんだ点が、もう立体の面の上にないとき(前の作業で形が変わったとき)。少しの誤差は許す
  const near = (p: Vec3) => new FaceFinder().atDistance(0, p, 1e-3).find(body).length > 0;
  if (!f.faces.every((r) => near(r.point))) return { ok: false, error: "えらんだ面が見つかりません。面をえらび直してください" };
  // のこすあつさが、立体のいちばんうすいところの半分より大きいと、中がなくなる
  const [lo, hi] = body.boundingBox.bounds;
  const thinnest = Math.min(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  if (f.thickness * 2 >= thinnest) return { ok: false, error: `あつさが大きすぎます。${Math.floor((thinnest / 2) * 10) / 10}mm より小さくしてください` };
  try {
    const shelled = body.shell(f.thickness, (finder) => finder.either(f.faces.map((r) => (g: typeof finder) => g.atDistance(0, r.point, 1e-3))));
    return { ok: true, body: shelled };
  } catch (err) {
    console.warn(err);
    return { ok: false, error: "くりぬけませんでした。あつさを小さくしてみてください(丸めた角よりうすくします)" };
  }
}

function loopDrawing(loop: Loop): Drawing {
  if (loop.kind === "circle") return drawCircle(loop.r).translate(loop.center[0], loop.center[1]);
  const [first, ...rest] = loop.segments;
  let pen = draw(first.from);
  for (const s of [first, ...rest]) {
    pen = s.kind === "line" ? pen.lineTo(s.to) : pen.threePointsArcTo(s.to, s.mid);
  }
  return pen.close();
}

function sketchLines(s: SketchFeature): Float32Array {
  const plane = resolvePlane(s.plane);
  const pos = new Map<Id, [number, number]>([["origin", [0, 0]]]);
  for (const e of s.entities) if (e.type === "point") pos.set(e.id, [e.x, e.y]);
  const out: number[] = [];
  const seg = (a: [number, number], b: [number, number]) => out.push(...toWorld(plane, a), ...toWorld(plane, b));
  for (const e of s.entities) {
    if (e.type === "line") seg(pos.get(e.p1)!, pos.get(e.p2)!);
    else if (e.type === "circle" || e.type === "arc") {
      const c = pos.get(e.c)!;
      let a0 = 0;
      let sweep = Math.PI * 2;
      if (e.type === "arc") {
        a0 = e.a0;
        sweep = e.a1 - e.a0;
        while (sweep <= 0) sweep += Math.PI * 2;
      }
      const n = 48;
      for (let i = 0; i < n; i++) {
        const p = (k: number): [number, number] => [c[0] + e.r * Math.cos(a0 + (sweep * k) / n), c[1] + e.r * Math.sin(a0 + (sweep * k) / n)];
        seg(p(i), p(i + 1));
      }
    }
  }
  return Float32Array.from(out);
}

/** 線分の並び(start から count 本、1本は xyz×2)の、長さの半分の位置 */
function polylineMid(lines: number[], start: number, count: number): Vec3 {
  const seg = (i: number) => lines.slice((start + i) * 6, (start + i) * 6 + 6);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const s = seg(i);
    total += Math.hypot(s[3] - s[0], s[4] - s[1], s[5] - s[2]);
  }
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const s = seg(i);
    const l = Math.hypot(s[3] - s[0], s[4] - s[1], s[5] - s[2]);
    if (acc + l >= total / 2) {
      const t = l > 0 ? (total / 2 - acc) / l : 0;
      return [s[0] + (s[3] - s[0]) * t, s[1] + (s[4] - s[1]) * t, s[2] + (s[5] - s[2]) * t];
    }
    acc += l;
  }
  const s = seg(0);
  return [s[0], s[1], s[2]];
}

/** 立体を表示用の三角形と輪郭線にする */
export function meshBody(body: Shape3D): BodyMesh {
  const m = body.mesh(MESH_OPTIONS);
  const e = body.meshEdges(MESH_OPTIONS);
  const faces = body.faces.map((f) => {
    if (f.geomType !== "PLANE") return { planar: false as const };
    const c = f.center;
    const n = f.normalAt(c);
    return { planar: true as const, origin: c.toTuple() as Vec3, normal: n.toTuple() as Vec3 };
  });
  return {
    vertices: Float32Array.from(m.vertices),
    normals: Float32Array.from(m.normals),
    triangles: Uint32Array.from(m.triangles),
    edges: Float32Array.from(e.lines),
    // meshEdges の範囲は点の数で数えている(線分1本 = 点2つ)ので、線分の数に直す
    edgeGroups: e.edgeGroups.map((g) => ({ start: g.start / 2, count: g.count / 2, mid: polylineMid(e.lines, g.start / 2, g.count / 2) })),
    faceGroups: m.faceGroups.map((g, i) => ({ start: g.start, count: g.count, face: i })),
    faces,
  };
}

