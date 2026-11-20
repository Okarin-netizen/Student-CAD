// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// カメラの絵の中からマーカーを見つけ、マーカーの位置と向きを計算する。2026-11-20 追加。
// マーカーさがしは js-aruco2(MIT)、位置と向きは その中の POSIT という計算を使う。
//
// 座標の向き
//   three.js のカメラ … x 右・y 上・z 手前(カメラは -z の向きを見る)
//   マーカー           … 紙の真ん中が原点。x 右・y 紙の上・z 紙から出る向き(表がわ)

import * as THREE from "three";
import { Detector, Posit, type PositSolver } from "./aruco";
import { MARKER_DICTIONARY, MARKER_ID, MARKER_MM } from "./markerSheet";

/** カメラの焦点距離(画面のはばに対する比)。ふつうの Web カメラ(横の見える角度 約 60°)に合わせる */
export const FOCAL_RATIO = 0.87;

export class MarkerTracker {
  private detector = new Detector({ dictionaryName: MARKER_DICTIONARY });
  private posit: PositSolver;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.posit = new Posit(MARKER_MM, width * FOCAL_RATIO);
  }

  /** three.js のカメラの縦の見える角度(度)。POSIT と同じ焦点距離にする */
  get fovDeg(): number {
    return THREE.MathUtils.radToDeg(2 * Math.atan(this.height / 2 / (this.width * FOCAL_RATIO)));
  }

  /**
   * 絵(RGBA)の中のマーカーをさがし、マーカー → カメラ の変換(単位 mm)を返す。見つからなければ null
   */
  detect(rgba: Uint8ClampedArray): THREE.Matrix4 | null {
    const marker = this.detector.detectImage(this.width, this.height, rgba).find((m) => m.id === MARKER_ID);
    if (!marker) return null;
    return this.poseFromCorners(marker.corners);
  }

  /** マーカーの 4 すみ(左上から時計回り、画面の座標)から、マーカー → カメラ の変換を作る */
  poseFromCorners(corners: { x: number; y: number }[]): THREE.Matrix4 {
    // POSIT は 絵の真ん中が原点・y が上 の座標を使う
    const pts = corners.map((c) => ({ x: c.x - this.width / 2, y: -(c.y - this.height / 2) }));
    const pose = this.posit.pose(pts);
    const r = pose.bestRotation;
    const t = pose.bestTranslation;
    // POSIT のカメラは z が前(奥)なので、three.js(z が手前)に合わせて z を反転する。
    // マーカーの z も反転して、裏返し(鏡)にならないようにする
    // M = F · [R|t] · F   (F = z を反転)
    return new THREE.Matrix4().set(
      r[0][0], r[0][1], -r[0][2], t[0],
      r[1][0], r[1][1], -r[1][2], t[1],
      -r[2][0], -r[2][1], r[2][2], -t[2],
      0, 0, 0, 1,
    );
  }
}
