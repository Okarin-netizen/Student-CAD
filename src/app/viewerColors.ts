// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/**
 * 3D の画面の色。2026-11-21 追加(デザインの改善 段階2)。
 * これまで立体は青、基準の板は青・緑・オレンジで、画面のほかの所(三角定規の墨とみどり)と合っていなかった。
 * 色はここにまとめ、Viewer3D はここだけを見る。
 */
export interface ViewerColors {
  /** 立体の色 */
  body: number;
  /** 下からの光(影の色あい) */
  hemiGround: number;
  /** 立体のふちの線 */
  edge: number;
  /** 床の方眼(10 本ごとの線・ふつうの線) */
  gridMajor: number;
  grid: number;
  /** 基準の板(上・正面・右)。どれも同じ色にして、名前で見分ける */
  plane: number;
  planeOpacity: number;
  /** 3D の上にかいた絵の線 */
  sketch: number;
  /** えらんだ辺・面、指をのせている面 */
  pick: number;
  /** えらべない面 */
  pickNg: number;
  /** ビューキューブ */
  cubeFace: string;
  cubeLine: string;
  cubeText: string;
}

/** 案A「紙と墨」: 立体は紙の白、ふちは墨。図面と同じ見た目 */
const PAPER: ViewerColors = {
  body: 0xf4f1ea,
  hemiGround: 0x8f9c95,
  edge: 0x14201b,
  gridMajor: 0xa9b8b0,
  grid: 0xd5ddd8,
  plane: 0x14201b,
  planeOpacity: 0.05,
  sketch: 0x0f7356,
  pick: 0xe8590c,
  pickNg: 0x9fada6,
  cubeFace: "#ffffff",
  cubeLine: "#14201b",
  cubeText: "#14201b",
};

/** 案B「うすいみどり」: 立体は画面のみどりをうすくした色 */
const SAGE: ViewerColors = { ...PAPER, body: 0xa8cdbd, sketch: 0x14201b };

/** 案C「木」: 技術科の木材のような色 */
const WOOD: ViewerColors = { ...PAPER, body: 0xdcc29a };

export const VIEWER_COLOR_OPTIONS = { paper: PAPER, sage: SAGE, wood: WOOD };

export const viewerColors: ViewerColors = PAPER;

/** 色の数(0xRRGGBB)を CSS の色の文字にする */
export function cssColor(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}
