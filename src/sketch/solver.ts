import { SolveStatus, type GcsWrapper, type SketchPrimitive } from "@salusoft89/planegcs";
import {
  ORIGIN_ID,
  type CurveEntity,
  type Id,
  type SketchConstraint,
  type SketchEntity,
  type SketchFeature,
} from "../doc/types";

export interface DragTarget {
  /** 動かしたい点と、その目標位置 */
  points: { id: Id; x: number; y: number }[];
}

export interface SketchSolveResult {
  ok: boolean;
  /** 解いた結果の図形(ok でなければ元のまま) */
  entities: SketchEntity[];
  /** 残りの自由度。0 なら形がすべて決まっている(完全定義) */
  dof: number;
  /** 矛盾・重複している拘束の id */
  conflicting: Id[];
  redundant: Id[];
  status: SolveStatus;
}

const entityMap = (entities: SketchEntity[]) => new Map(entities.map((e) => [e.id, e]));

/** 文書のスケッチを planegcs の「プリミティブ」の並びに直す。点 → 曲線 → 拘束 の順で入れる。 */
export function toPrimitives(sketch: Pick<SketchFeature, "entities" | "constraints">, drag?: DragTarget): SketchPrimitive[] {
  const prims: SketchPrimitive[] = [{ id: ORIGIN_ID, type: "point", x: 0, y: 0, fixed: true }];
  const ents = entityMap(sketch.entities);
  const curves: SketchPrimitive[] = [];

  for (const e of sketch.entities) {
    switch (e.type) {
      case "point":
        prims.push({ id: e.id, type: "point", x: e.x, y: e.y, fixed: false });
        break;
      case "line":
        curves.push({ id: e.id, type: "line", p1_id: e.p1, p2_id: e.p2 });
        break;
      case "circle":
        curves.push({ id: e.id, type: "circle", c_id: e.c, radius: e.r });
        break;
      case "arc":
        curves.push(
          {
            id: e.id,
            type: "arc",
            c_id: e.c,
            radius: e.r,
            start_angle: e.a0,
            end_angle: e.a1,
            start_id: e.start,
            end_id: e.end,
          },
          { id: `${e.id}__rules`, type: "arc_rules", a_id: e.id },
        );
        break;
    }
  }
  prims.push(...curves);
  for (const c of sketch.constraints) {
    const p = constraintToPrimitive(c, ents);
    if (p) prims.push(p);
  }
  for (const d of drag?.points ?? []) {
    prims.push(
      { id: `drag_x_${d.id}`, type: "coordinate_x", p_id: d.id, x: d.x, temporary: true },
      { id: `drag_y_${d.id}`, type: "coordinate_y", p_id: d.id, y: d.y, temporary: true },
    );
  }
  return prims;
}

function constraintToPrimitive(c: SketchConstraint, ents: Map<Id, SketchEntity>): SketchPrimitive | null {
  const kind = (id: Id) => ents.get(id)?.type ?? (id === ORIGIN_ID ? "point" : undefined);
  switch (c.type) {
    case "coincident":
      return { id: c.id, type: "p2p_coincident", p1_id: c.a, p2_id: c.b };
    case "horizontal":
      return { id: c.id, type: "horizontal_l", l_id: c.line };
    case "vertical":
      return { id: c.id, type: "vertical_l", l_id: c.line };
    case "parallel":
      return { id: c.id, type: "parallel", l1_id: c.a, l2_id: c.b };
    case "perpendicular":
      return { id: c.id, type: "perpendicular_ll", l1_id: c.a, l2_id: c.b };
    case "equal": {
      const ka = kind(c.a);
      const kb = kind(c.b);
      if (ka === "line" && kb === "line") return { id: c.id, type: "equal_length", l1_id: c.a, l2_id: c.b };
      if (ka === "circle" && kb === "circle") return { id: c.id, type: "equal_radius_cc", c1_id: c.a, c2_id: c.b };
      if (ka === "arc" && kb === "arc") return { id: c.id, type: "equal_radius_aa", a1_id: c.a, a2_id: c.b };
      if (ka === "circle" && kb === "arc") return { id: c.id, type: "equal_radius_ca", c1_id: c.a, a2_id: c.b };
      if (ka === "arc" && kb === "circle") return { id: c.id, type: "equal_radius_ca", c1_id: c.b, a2_id: c.a };
      return null;
    }
    case "pointOnCircle":
      return kind(c.circle) === "arc"
        ? { id: c.id, type: "point_on_arc", p_id: c.point, a_id: c.circle }
        : { id: c.id, type: "point_on_circle", p_id: c.point, c_id: c.circle };
    case "pointOnLine":
      return { id: c.id, type: "point_on_line_pl", p_id: c.point, l_id: c.line };
    case "length": {
      const l = ents.get(c.line);
      if (l?.type !== "line") return null;
      return { id: c.id, type: "p2p_distance", p1_id: l.p1, p2_id: l.p2, distance: c.value };
    }
    case "distance":
      return { id: c.id, type: "p2p_distance", p1_id: c.a, p2_id: c.b, distance: c.value };
    case "diameter":
      return kind(c.circle) === "arc"
        ? { id: c.id, type: "arc_diameter", a_id: c.circle, diameter: c.value }
        : { id: c.id, type: "circle_diameter", c_id: c.circle, diameter: c.value };
    case "angle":
      return { id: c.id, type: "l2l_angle_ll", l1_id: c.a, l2_id: c.b, angle: (c.value * Math.PI) / 180 };
  }
}

/** スケッチを解き、結果の座標を返す。失敗したときは元の図形をそのまま返す。 */
export function solveSketch(
  gcs: GcsWrapper,
  sketch: Pick<SketchFeature, "entities" | "constraints">,
  drag?: DragTarget,
): SketchSolveResult {
  gcs.clear_data();
  gcs.push_primitives_and_params(toPrimitives(sketch, drag));
  const status = gcs.solve();
  const conflicting = gcs.has_gcs_conflicting_constraints() ? gcs.get_gcs_conflicting_constraints() : [];
  const redundant = gcs.has_gcs_redundant_constraints() ? gcs.get_gcs_redundant_constraints() : [];
  const converged = status === SolveStatus.Success || status === SolveStatus.Converged;
  const ok = converged && conflicting.length === 0 && redundant.length === 0;
  if (!ok) {
    return { ok, entities: sketch.entities, dof: -1, conflicting, redundant, status };
  }
  gcs.apply_solution();
  const solved = new Map(gcs.sketch_index.get_primitives().map((p) => [p.id, p]));
  const entities = sketch.entities.map((e): SketchEntity => {
    const s = solved.get(e.id);
    if (!s) return e;
    if (e.type === "point" && s.type === "point") return { ...e, x: s.x, y: s.y };
    if (e.type === "circle" && s.type === "circle") return { ...e, r: s.radius };
    if (e.type === "arc" && s.type === "arc") return { ...e, r: s.radius, a0: s.start_angle, a1: s.end_angle };
    return e;
  });
  // ドラッグ用の一時的な拘束は自由度に数えない
  const dof = drag ? -1 : gcs.gcs.dof();
  return { ok, entities, dof, conflicting, redundant, status };
}

// ---- 形の計測(寸法を入れるときの初期値に使う) ----

export function pointPos(entities: SketchEntity[], id: Id): [number, number] {
  if (id === ORIGIN_ID) return [0, 0];
  const e = entities.find((x) => x.id === id);
  if (!e || e.type !== "point") throw new Error(`point ${id} not found`);
  return [e.x, e.y];
}

export function measureLength(entities: SketchEntity[], line: CurveEntity & { type: "line" }): number {
  const [a, b] = [pointPos(entities, line.p1), pointPos(entities, line.p2)];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function lineDir(entities: SketchEntity[], line: CurveEntity & { type: "line" }): [number, number] {
  const [a, b] = [pointPos(entities, line.p1), pointPos(entities, line.p2)];
  return [b[0] - a[0], b[1] - a[1]];
}

/** 2本の線の角度(0〜180度)。planegcs の l2l_angle と同じく、向きつきの角度 */
export function measureAngle(entities: SketchEntity[], a: CurveEntity & { type: "line" }, b: CurveEntity & { type: "line" }): number {
  const [ax, ay] = lineDir(entities, a);
  const [bx, by] = lineDir(entities, b);
  const ang = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  return (ang * 180) / Math.PI;
}
