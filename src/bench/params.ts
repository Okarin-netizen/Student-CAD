// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 技術検証用の「穴あきプレート」(キーホルダーの土台)の寸法。単位はすべて mm。
export interface PlateParams {
  width: number;
  height: number;
  thickness: number;
  holeDiameter: number;
  /** 穴の中心の、左の辺からの距離 */
  holeX: number;
  /** 穴の中心の、下の辺からの距離 */
  holeY: number;
  /** 角の丸み(0 なら角ばったまま) */
  cornerRadius: number;
}

export type ParamKey = keyof PlateParams;

export const DEFAULT_PARAMS: PlateParams = {
  width: 50,
  height: 30,
  thickness: 4,
  holeDiameter: 6,
  holeX: 8,
  holeY: 15,
  cornerRadius: 3,
};

export interface ParamSpec {
  key: ParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const PARAM_SPECS: ParamSpec[] = [
  { key: "width", label: "よこの長さ", min: 5, max: 200, step: 1 },
  { key: "height", label: "たての長さ", min: 5, max: 200, step: 1 },
  { key: "thickness", label: "あつみ", min: 1, max: 50, step: 0.5 },
  { key: "holeDiameter", label: "穴の直径", min: 0, max: 100, step: 0.5 },
  { key: "holeX", label: "穴の位置(左から)", min: 0, max: 200, step: 0.5 },
  { key: "holeY", label: "穴の位置(下から)", min: 0, max: 200, step: 0.5 },
  { key: "cornerRadius", label: "角の丸み", min: 0, max: 50, step: 0.5 },
];

/** 穴とふちの間に最低限残す肉の厚さ(3Dプリントで割れないように) */
export const MIN_WALL = 1;

/**
 * 形として作れない寸法の組み合わせを、生徒に読める日本語で返す。
 * 空配列なら作れる。
 */
export function validateParams(p: PlateParams): string[] {
  const problems: string[] = [];
  for (const spec of PARAM_SPECS) {
    const v = p[spec.key];
    if (!Number.isFinite(v)) {
      problems.push(`「${spec.label}」に数字を入れてください。`);
    } else if (v < spec.min || v > spec.max) {
      problems.push(`「${spec.label}」は ${spec.min}〜${spec.max} mm にしてください。`);
    }
  }
  if (problems.length > 0) return problems;

  const r = p.holeDiameter / 2;
  if (r > 0) {
    if (p.holeX - r < MIN_WALL || p.holeX + r > p.width - MIN_WALL) {
      problems.push("穴が左右のふちからはみ出しています。穴の位置か直径を変えてください。");
    }
    if (p.holeY - r < MIN_WALL || p.holeY + r > p.height - MIN_WALL) {
      problems.push("穴が上下のふちからはみ出しています。穴の位置か直径を変えてください。");
    }
  }
  if (p.cornerRadius > 0 && p.cornerRadius >= Math.min(p.width, p.height) / 2) {
    problems.push("角の丸みが大きすぎます。短い辺の半分より小さくしてください。");
  }
  return problems;
}
