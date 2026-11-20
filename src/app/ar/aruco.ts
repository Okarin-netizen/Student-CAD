// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// js-aruco2(MIT、© Damiano Falcioni / Juan Mellado)を読みこむ。2026-11-20 追加。
//
// js-aruco2 は古い書き方(ファイルの一番上で this.AR = ... として出す)なので、
// そのままでは Vite でまとめられない。そこで、元のファイルを文字のまま読みこみ、
// 入れ物(scope)を this にして実行し、出てきた CV・SVD・AR・POS を受け取る。
// 元のファイルは書きかえていない。

import cvSource from "js-aruco2/src/cv.js?raw";
import svdSource from "js-aruco2/src/svd.js?raw";
import positSource from "js-aruco2/src/posit1.js?raw";
import arucoSource from "js-aruco2/src/aruco.js?raw";

export interface ArucoCorner {
  x: number;
  y: number;
}

export interface ArucoMarker {
  id: number;
  corners: ArucoCorner[];
  hammingDistance: number;
}

export interface ArucoDetector {
  detectImage(width: number, height: number, data: Uint8ClampedArray): ArucoMarker[];
}

export interface ArucoDictionary {
  codeList: string[];
}

export interface PositPose {
  bestError: number;
  bestRotation: number[][];
  bestTranslation: number[];
}

export interface PositSolver {
  pose(imagePoints: ArucoCorner[]): PositPose;
}

interface Scope {
  CV?: unknown;
  SVD?: unknown;
  AR?: {
    Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => ArucoDetector;
    Dictionary: new (name: string) => ArucoDictionary;
  };
  POS?: { Posit: new (modelSize: number, focalLength: number) => PositSolver };
}

/** 元のファイルを、scope を this にして実行する(require は使われないようにしてある) */
function run(source: string, scope: Scope): void {
  const noRequire = () => {
    throw new Error("js-aruco2: 読みこむ順番がちがいます");
  };
  new Function("require", source).call(scope, noRequire);
}

const scope: Scope = {};
run(cvSource, scope); // scope.CV
run(svdSource, scope); // scope.SVD
run(positSource, scope); // scope.POS(SVD を使う)
run(arucoSource, scope); // scope.AR(CV を使う)

/** マーカーをさがす */
export const Detector = scope.AR!.Detector;
/** マーカーの種類(マス目の表) */
export const Dictionary = scope.AR!.Dictionary;
/** マーカーの 4 すみから、位置と向きを計算する */
export const Posit = scope.POS!.Posit;
