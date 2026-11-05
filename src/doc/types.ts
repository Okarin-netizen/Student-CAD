// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

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
  | { kind: "face"; featureId: Id; plane: Plane3 }
  /** 基準面を、その向き(法線)に distance mm ずらした面(フェーズ4。ロフトで高さのちがう形をかくのに使う) */
  | { kind: "offset"; base: BasePlaneName; distance: number };

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

/**
 * 文字(名札など)。p の点が文字の左下(ベースライン)になる。
 * 輪郭の線ではないので、拘束はつけられない(位置は p の点で決める)。
 */
export interface TextEntity extends EntityBase {
  type: "text";
  p: Id;
  text: string;
  /** 文字の大きさ(mm)。だいたい漢字1文字の高さ */
  size: number;
}

export type SketchEntity = PointEntity | LineEntity | CircleEntity | ArcEntity | TextEntity;
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

/**
 * 寸法。expr があれば、それは変数を使った式(例: "幅/2")で、value はその計算結果。
 * 変数を変えると value が計算し直される。
 */
export type DimensionConstraint =
  | { id: Id; type: "length"; line: Id; value: number; expr?: string }
  | { id: Id; type: "distance"; a: Id; b: Id; value: number; expr?: string }
  | { id: Id; type: "diameter"; circle: Id; value: number; expr?: string }
  /** 2本の線の角度(度) */
  | { id: Id; type: "angle"; a: Id; b: Id; value: number; expr?: string };

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

/**
 * 作業の数の欄を、変数を使った式で決めているときの式(欄の名前 → 式)。
 * 例: { distance: "あつさ" }
 */
export type NumberExprs = Partial<Record<string, string>>;

export interface ExtrudeFeature {
  id: Id;
  type: "extrude";
  name: string;
  sketchId: Id;
  distance: number;
  operation: ExtrudeOperation;
  /** 向きを反対にする */
  flip: boolean;
  exprs?: NumberExprs;
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
  exprs?: NumberExprs;
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
  exprs?: NumberExprs;
}

/** 世界の軸。x: 赤、y: 緑、z: 青(上向き) */
export type WorldAxis = "x" | "y" | "z";

/**
 * ミラー(対称にする)。source が "body" なら、それまでの立体全体を鏡に映してくっつける。
 * 作業の id なら、その作業(押し出し・回転など)だけを鏡に映して、同じようにくっつける / けずる。
 */
export interface MirrorFeature {
  id: Id;
  type: "mirror";
  name: string;
  source: "body" | Id;
  /** 鏡にする基準面(原点を通る) */
  plane: BasePlaneName;
  /** 数の欄はないが、ほかの作業とそろえておく */
  exprs?: NumberExprs;
}

/**
 * パターン(ならべる)。source の作業を、まっすぐ(linear)または円のまわり(circular)にならべる。
 * linear は2方向まで(count2 が 2 以上なら、格子のようにならべる)。
 */
export interface PatternFeature {
  id: Id;
  type: "pattern";
  name: string;
  source: Id;
  kind: "linear" | "circular";
  /** linear: ならべる向き、circular: 回す軸(原点を通る) */
  axis: WorldAxis;
  /** 向きを反対にする(linear のみ) */
  flip: boolean;
  /** いくつにするか(元のものを含む) */
  count: number;
  /** linear: となりとの間かく(mm) */
  spacing: number;
  /** circular: 全体の角度(360 なら一周に均等) */
  angle: number;
  /** linear の2つ目の向き(count2 が 1 なら使わない) */
  axis2: WorldAxis;
  count2: number;
  spacing2: number;
  exprs?: NumberExprs;
}

/**
 * ロフト(つなぐ)。2つ以上のスケッチの形を、順番になめらかにつないだ立体を作る。
 * どのスケッチも、閉じた形(穴なし)が1つだけ。
 */
export interface LoftFeature {
  id: Id;
  type: "loft";
  name: string;
  /** つなぐ順のスケッチ */
  sketchIds: Id[];
  operation: ExtrudeOperation;
  /** true: となりの形をまっすぐ(平らな面で)つなぐ。false: なめらかにつなぐ */
  ruled: boolean;
  exprs?: NumberExprs;
}

/**
 * なぞる(スイープ)。断面のスケッチの形を、道すじのスケッチの線にそって動かした立体を作る。
 * 道すじは閉じていない線(線・円弧をつないだもの)1本。断面は閉じた形1つ(穴なし)。
 * 断面は、道すじのはじめの点を通る面にかく(例: 道すじを上の面、断面を右の面に)。
 */
export interface SweepFeature {
  id: Id;
  type: "sweep";
  name: string;
  pathId: Id;
  profileId: Id;
  operation: ExtrudeOperation;
  exprs?: NumberExprs;
}

/** 立体の平らな面の目印。えらんだときにタップした、面の上の点と、面の向き */
export interface FaceRef {
  point: Vec3;
  normal: Vec3;
}

/**
 * くりぬく(シェル)。えらんだ面を取りのぞき、のこりを thickness mm のあつさのからにする。
 * ペン立てやコップの中をくりぬくのに使う。
 */
export interface ShellFeature {
  id: Id;
  type: "shell";
  name: string;
  thickness: number;
  faces: FaceRef[];
  exprs?: NumberExprs;
}

/** スケッチを使って立体を作る作業 */
export type ProfileFeature = ExtrudeFeature | RevolveFeature;

export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | FilletFeature | MirrorFeature | PatternFeature | LoftFeature | ShellFeature | SweepFeature;

/**
 * 変数(名前のついた数)。寸法やあつさに名前で使える。
 * expr は数か、ほかの変数を使った式(例: "幅/2")。value はその計算結果。
 */
export interface Variable {
  id: Id;
  name: string;
  expr: string;
  value: number;
}

/**
 * 課題で自動で確かめる条件(フェーズ3)。
 * - size: 立体の はば(x)・奥行き(y)・高さ(z) が min〜max mm に入っているか
 * - volume: 体積が min〜max cm³ に入っているか(材料の量の目安)
 * - uses: その作業(または文字)を使ったか
 */
export type AssignmentCheck =
  | { id: Id; kind: "size"; axis: WorldAxis; min?: number; max?: number }
  | { id: Id; kind: "volume"; min?: number; max?: number }
  | { id: Id; kind: "uses"; feature: Exclude<Feature["type"], "sketch"> | "text" };

/** 先生が作る課題。課題ファイルは、課題つきの作品ファイル(.scad.json)と同じ形 */
export interface Assignment {
  title: string;
  /** 生徒に見せる説明(改行してよい) */
  instructions: string;
  checks: AssignmentCheck[];
}

/** 作品の記録(提出のときに先生が見る) */
/** 作った人 */
export interface Author {
  /** 学籍番号(4桁。例 "2312")。図面の表題欄とファイル名に使う */
  studentId: string;
  /** 組(例 "2-3")。提出用ファイルに使う */
  klass: string;
  /** 出席番号 */
  number: string;
  name: string;
}

export interface DocMeta {
  /** 作り始めた時刻(ISO 8601) */
  createdAt: string;
  /** 最後に変えた時刻(ISO 8601) */
  updatedAt: string;
  /** 作業していた時間の合計(秒)。5分以上 手が止まっていた間は数えない */
  activeSeconds: number;
  /** 作った人(図面の表題欄・提出に使う。古いファイルにはない) */
  author?: Author;
}

/** 図面で手で足した寸法。点は その図の上の座標(実物の mm) */
export interface AddedDimension {
  id: string;
  /** どの図か(0 正面図・1 平面図・2 右側面図) */
  view: 0 | 1 | 2;
  a: Vec2;
  b: Vec2;
  /** h = 横の長さをはかる、v = たての長さをはかる */
  dir: "h" | "v";
}

/** 図面の寸法の手直し(フェーズ5で追加。古いファイルにはない) */
export interface DrawingNotes {
  /** 消した自動の寸法の名前 */
  hidden: string[];
  /** 手で足した寸法 */
  added: AddedDimension[];
}

export interface CadDocument {
  format: "student-cad";
  version: 1;
  name: string;
  features: Feature[];
  /** 変数(フェーズ2で追加。古いファイルにはない) */
  variables?: Variable[];
  /** 課題(フェーズ3で追加。課題ファイルから始めたときだけある) */
  assignment?: Assignment;
  /** 作品の記録(フェーズ3で追加) */
  meta?: DocMeta;
  /** 図面の寸法の手直し */
  drawing?: DrawingNotes;
}

export function emptyDocument(name = "新しい作品"): CadDocument {
  return { format: "student-cad", version: 1, name, features: [], variables: [] };
}
