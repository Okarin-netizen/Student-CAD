import { Plane, draw, drawCircle, type Drawing, type Shape3D } from "replicad";
import type { GcsWrapper } from "@salusoft89/planegcs";
import type { CadDocument, Id, Plane3, SketchFeature, Vec3 } from "../doc/types";
import { resolvePlane, scale3, toWorld } from "../doc/planes";
import { solveSketch } from "../sketch/solver";
import { findProfiles, type Loop, type Region } from "../sketch/profiles";

export type FeatureStatus = { id: Id; ok: true; warning?: string } | { id: Id; ok: false; error: string };

export interface BodyMesh {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  edges: Float32Array;
  /** 三角形の範囲ごとの面の番号 */
  faceGroups: { start: number; count: number; face: number }[];
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

    // 押し出し
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
      if (f.distance <= 0) {
        statuses.push({ id: f.id, ok: false, error: "長さは 0 より大きくしてください" });
        continue;
      }
      const plane = resolvePlane(sketch.plane);
      const tool = extrudeRegions(regions, plane, f.distance, f.operation === "cut" ? !f.flip : f.flip);
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
    faceGroups: m.faceGroups.map((g, i) => ({ start: g.start, count: g.count, face: i })),
    faces,
  };
}

