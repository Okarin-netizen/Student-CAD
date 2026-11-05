// 設計図(作業のれきし)のデータ構造。
// これだけを保存すれば、形はいつでも頭から計算し直せる(Onshape と同じく「履歴が正」)。

export type Id = string;
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** スケッチを描く平面。yDir = normal × xDir */
export interface Plane3 {
  origin: Vec3;
  xDir: Vec3;
  normal: Vec3;
}

export type BasePlaneName = "top" | "front" | "right";

export type PlaneRef =
  | { kind: "base"; name: BasePlaneName }
  /** 立体の平らな面。選んだときの位置で固定する(上流を変えても動かない) */
  | { kind: "face"; featureId: Id; plane: Plane3 };

// ---- スケッチの図形 ----

interface EntityBase {
  id: Id;
  /** 補助線(形の輪郭には使わない) */
  construction?: boolean;
}

export interface PointEntity extends EntityBase {
  type: "point";
  x: number;
  y: number;
}

export interface LineEntity extends EntityBase {
  type: "line";
  p1: Id;
  p2: Id;
}

export interface CircleEntity extends EntityBase {
  type: "circle";
  c: Id;
  r: number;
}

/** 中心 c のまわりを start から end へ反時計回りに描く円弧 */
export interface ArcEntity extends EntityBase {
  type: "arc";
  c: Id;
  start: Id;
  end: Id;
  r: number;
  a0: number;
  a1: number;
}

export type SketchEntity = PointEntity | LineEntity | CircleEntity | ArcEntity;
export type CurveEntity = LineEntity | CircleEntity | ArcEntity;

/** どのスケッチにもある、動かない原点 */
export const ORIGIN_ID = "origin";

// ---- 拘束と寸法 ----

export type GeometricConstraint =
  | { id: Id; type: "coincident"; a: Id; b: Id }
  | { id: Id; type: "horizontal"; line: Id }
  | { id: Id; type: "vertical"; line: Id }
  | { id: Id; type: "parallel"; a: Id; b: Id }
  | { id: Id; type: "perpendicular"; a: Id; b: Id }
  /** 線どうしなら同じ長さ、円・円弧どうしなら同じ半径 */
  | { id: Id; type: "equal"; a: Id; b: Id }
  /** 点を円(円弧)の上にのせる。多角形の内部で使う */
  | { id: Id; type: "pointOnCircle"; point: Id; circle: Id }
  /** 点を線の上(延長線を含む)にのせる */
  | { id: Id; type: "pointOnLine"; point: Id; line: Id };

export type DimensionConstraint =
  | { id: Id; type: "length"; line: Id; value: number }
  | { id: Id; type: "distance"; a: Id; b: Id; value: number }
  | { id: Id; type: "diameter"; circle: Id; value: number }
  /** 2本の線の角度(度) */
  | { id: Id; type: "angle"; a: Id; b: Id; value: number };

export type SketchConstraint = GeometricConstraint | DimensionConstraint;

export const DIMENSION_TYPES = ["length", "distance", "diameter", "angle"] as const;
export function isDimension(c: SketchConstraint): c is DimensionConstraint {
  return (DIMENSION_TYPES as readonly string[]).includes(c.type);
}

// ---- 作業(フィーチャー) ----

export interface SketchFeature {
  id: Id;
  type: "sketch";
  name: string;
  plane: PlaneRef;
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export type ExtrudeOperation = "add" | "cut";

export interface ExtrudeFeature {
  id: Id;
  type: "extrude";
  name: string;
  sketchId: Id;
  distance: number;
  operation: ExtrudeOperation;
  /** 向きを反対にする */
  flip: boolean;
}

/** 回す軸: スケッチの横の軸(x)・たての軸(y)、またはスケッチの中の線 */
export type RevolveAxis = { kind: "x" } | { kind: "y" } | { kind: "line"; line: Id };

export interface RevolveFeature {
  id: Id;
  type: "revolve";
  name: string;
  sketchId: Id;
  axis: RevolveAxis;
  /** 回す角度(度)。360 で一周 */
  angle: number;
  operation: ExtrudeOperation;
  /** 回す向きを反対にする */
  flip: boolean;
}

/**
 * 辺の目印。辺の番号は形を作り直すと変わるので、選んだときの辺の真ん中の点を覚えておき、
 * 作り直したあとは一番近い辺を探す。
 */
export interface EdgeRef {
  mid: Vec3;
}

export interface FilletFeature {
  id: Id;
  type: "fillet";
  name: string;
  /** fillet: 角を丸める、chamfer: 角を落とす(面取り) */
  kind: "fillet" | "chamfer";
  radius: number;
  edges: EdgeRef[];
}

/** スケッチを使って立体を作る作業 */
export type ProfileFeature = ExtrudeFeature | RevolveFeature;

export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | FilletFeature;

export interface CadDocument {
  format: "student-cad";
  version: 1;
  name: string;
  features: Feature[];
}

export function emptyDocument(name = "新しい作品"): CadDocument {
  return { format: "student-cad", version: 1, name, features: [] };
}
