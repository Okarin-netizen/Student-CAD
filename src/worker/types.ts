import type { MeshData } from "../kernel/buildPlate";
import type { SolvedSketch } from "../sketch/plateSketch";

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
