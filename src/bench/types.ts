// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import type { MeshData } from "./buildPlate";
import type { SolvedSketch } from "./plateSketch";

export interface WasmResource {
  name: string;
  /** 実際に通信した量(圧縮後・キャッシュ時は 0) */
  transferKB: number;
  /** 展開後の大きさ */
  decodedKB: number;
  downloadMs: number;
}

export interface InitReport {
  gcsInitMs: number;
  ocInitMs: number;
  wasm: WasmResource[];
}

export interface Timings {
  solveMs: number;
  buildMs: number;
  meshMs: number;
}

export type RebuildResult =
  | {
      kind: "ok";
      sketch: SolvedSketch;
      mesh: MeshData;
      timings: Timings;
      triangleCount: number;
    }
  | {
      kind: "invalid";
      problems: string[];
      sketch?: SolvedSketch;
      detail?: string;
    };
