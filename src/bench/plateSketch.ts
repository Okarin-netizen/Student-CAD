import { SolveStatus, type GcsWrapper, type SketchPrimitive } from "@salusoft89/planegcs";
import type { PlateParams } from "./params";

export type Vec2 = [number, number];

/** 拘束計算で求めたスケッチの形 */
export interface SolvedSketch {
  /** 左下から反時計回りの4つの角 */
  corners: [Vec2, Vec2, Vec2, Vec2];
  hole: { cx: number; cy: number; r: number } | null;
  /** 拘束計算が収束したか */
  ok: boolean;
  status: SolveStatus;
  /** 矛盾している拘束の id(あれば) */
  conflicting: string[];
  /** 拘束計算にかかった時間 (ms) */
  solveMs: number;
}

/** 何も分からない状態から解かせるための、わざとずらした初期形 */
const ROUGH_GUESS: SolvedSketch["corners"] = [
  [0, 0],
  [10, 1],
  [11, 9],
  [-1, 10],
];

/**
 * 穴あきプレートのスケッチを、planegcs の「点・線・円 + 拘束」で表す。
 * Onshape/SolidWorks のスケッチと同じく、形は寸法と拘束だけで決まる。
 *
 *   p3 ── l2 ── p2
 *   │            │
 *   l3   (hc)    l1
 *   │            │
 *   p0 ── l0 ── p1      p0 は原点に固定
 */
export function plateSketchPrimitives(
  p: PlateParams,
  guess: SolvedSketch["corners"] = ROUGH_GUESS,
): SketchPrimitive[] {
  const [g0, g1, g2, g3] = guess;
  const prims: SketchPrimitive[] = [
    { id: "p0", type: "point", x: g0[0], y: g0[1], fixed: false },
    { id: "p1", type: "point", x: g1[0], y: g1[1], fixed: false },
    { id: "p2", type: "point", x: g2[0], y: g2[1], fixed: false },
    { id: "p3", type: "point", x: g3[0], y: g3[1], fixed: false },
    { id: "l0", type: "line", p1_id: "p0", p2_id: "p1" },
    { id: "l1", type: "line", p1_id: "p1", p2_id: "p2" },
    { id: "l2", type: "line", p1_id: "p2", p2_id: "p3" },
    { id: "l3", type: "line", p1_id: "p3", p2_id: "p0" },
    // 原点に固定
    { id: "fix_x", type: "coordinate_x", p_id: "p0", x: 0 },
    { id: "fix_y", type: "coordinate_y", p_id: "p0", y: 0 },
    // 水平・垂直(Onshape の Horizontal / Vertical)
    { id: "h0", type: "horizontal_l", l_id: "l0" },
    { id: "h2", type: "horizontal_l", l_id: "l2" },
    { id: "v1", type: "vertical_l", l_id: "l1" },
    { id: "v3", type: "vertical_l", l_id: "l3" },
    // 寸法(Onshape の Dimension)
    { id: "dim_width", type: "p2p_distance", p1_id: "p0", p2_id: "p1", distance: p.width },
    { id: "dim_height", type: "p2p_distance", p1_id: "p1", p2_id: "p2", distance: p.height },
  ];

  if (p.holeDiameter > 0) {
    // 穴の中心の初期位置もわざと少しずらす
    prims.push(
      { id: "hc", type: "point", x: p.holeX + 2, y: p.holeY - 2, fixed: false },
      { id: "hole", type: "circle", c_id: "hc", radius: Math.max(p.holeDiameter / 2 + 1, 0.5) },
      { id: "dim_hole_d", type: "circle_diameter", c_id: "hole", diameter: p.holeDiameter },
      {
        id: "dim_hole_x",
        type: "difference",
        param1: { o_id: "p0", prop: "x" },
        param2: { o_id: "hc", prop: "x" },
        difference: p.holeX,
      },
      {
        id: "dim_hole_y",
        type: "difference",
        param1: { o_id: "p0", prop: "y" },
        param2: { o_id: "hc", prop: "y" },
        difference: p.holeY,
      },
    );
  }
  return prims;
}

export function readSolvedSketch(prims: SketchPrimitive[]): Omit<SolvedSketch, "ok" | "status" | "conflicting" | "solveMs"> {
  const byId = new Map(prims.map((o) => [o.id, o]));
  const pt = (id: string): Vec2 => {
    const o = byId.get(id);
    if (!o || o.type !== "point") throw new Error(`point ${id} not found`);
    return [o.x, o.y];
  };
  const circle = byId.get("hole");
  const center = byId.get("hc");
  return {
    corners: [pt("p0"), pt("p1"), pt("p2"), pt("p3")],
    hole:
      circle && circle.type === "circle" && center && center.type === "point"
        ? { cx: center.x, cy: center.y, r: circle.radius }
        : null,
  };
}

/** planegcs でスケッチを解く。wrapper は使い回し、毎回中身を入れ替える。 */
export function solvePlateSketch(
  gcs: GcsWrapper,
  params: PlateParams,
  guess?: SolvedSketch["corners"],
): SolvedSketch {
  const t0 = performance.now();
  gcs.clear_data();
  gcs.push_primitives_and_params(plateSketchPrimitives(params, guess));
  const status = gcs.solve();
  gcs.apply_solution();
  const solveMs = performance.now() - t0;
  const conflicting = gcs.has_gcs_conflicting_constraints() ? gcs.get_gcs_conflicting_constraints() : [];
  const ok = (status === SolveStatus.Success || status === SolveStatus.Converged) && conflicting.length === 0;
  return { ...readSolvedSketch(gcs.sketch_index.get_primitives()), ok, status, conflicting, solveMs };
}
