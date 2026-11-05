import { Plane, draw, drawCircle, type Drawing, type Shape3D } from "replicad";
import type { GcsWrapper } from "@salusoft89/planegcs";
import type { CadDocument, FilletFeature, Id, Plane3, RevolveAxis, SketchFeature, Vec2, Vec3 } from "../doc/types";
import { resolvePlane, scale3, toWorld } from "../doc/planes";
import { pointPos, solveSketch } from "../sketch/solver";
import { findProfiles, type Loop, type Region } from "../sketch/profiles";

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

/**
 * 作業のれきしを頭から順に実行して、形を作り直す。
 * 途中の作業が失敗しても、そこで止めずに印を付けて次へ進む(Onshape と同じ)。
 */
export function rebuild(doc: CadDocument, gcs: GcsWrapper): RebuildOutput {
  const statuses: FeatureStatus[] = [];
  const solvedSketches = new Map<Id, SketchFeature>();
  const consumed = new Set<Id>();
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

    // 押し出し・回転
    const sketch = solvedSketches.get(f.sketchId);
    if (!sketch) {
      statuses.push({ id: f.id, ok: false, error: "使うスケッチが見つかりません" });
      continue;
    }
    consumed.add(sketch.id);
    try {
      const { regions, openChains } = findProfiles(sketch);
      if (regions.length === 0) {
        statuses.push({ id: f.id, ok: false, error: "スケッチに閉じた形がありません。線のはしをつなげてください" });
        continue;
      }
      const plane = resolvePlane(sketch.plane);
      let tool: Shape3D;
      if (f.type === "extrude") {
        if (f.distance <= 0) {
          statuses.push({ id: f.id, ok: false, error: "長さは 0 より大きくしてください" });
          continue;
        }
        tool = extrudeRegions(regions, plane, f.distance, f.operation === "cut" ? !f.flip : f.flip);
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

/** 面(と穴)をまとめて押し出した立体を作る。reverse なら面の裏側へ押し出す */
export function extrudeRegions(regions: Region[], plane: Plane3, distance: number, reverse: boolean): Shape3D {
  let drawing: Drawing | null = null;
  for (const r of regions) {
    let d = loopDrawing(r.outer);
    for (const h of r.holes) d = d.cut(loopDrawing(h));
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

