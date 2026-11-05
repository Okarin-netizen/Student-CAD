// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/// <reference lib="webworker" />
// 重い計算(拘束計算と3D形状計算)はすべてこの Web Worker の中で行う。
// 画面側(メインスレッド)は計算中もタッチ操作を受け付けられる。
import * as Comlink from "comlink";
import opencascade from "replicad-opencascadejs";
import ocWasmUrl from "replicad-opencascadejs/wasm?url";
import { setOC, type Shape3D } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { buildPlate, meshShape } from "./buildPlate";
import { solvePlateSketch, type SolvedSketch } from "./plateSketch";
import { validateParams, type PlateParams } from "./params";
import type { InitReport, RebuildResult, WasmResource } from "./types";

let gcs: GcsWrapper | null = null;
let currentShape: Shape3D | null = null;
let lastCorners: SolvedSketch["corners"] | undefined;

function wasmResources(): WasmResource[] {
  return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((e) => e.name.includes(".wasm"))
    .map((e) => ({
      name: e.name.split("/").pop() ?? e.name,
      transferKB: Math.round(e.transferSize / 1024),
      decodedKB: Math.round(e.decodedBodySize / 1024),
      downloadMs: Math.round(e.duration),
    }));
}

const api = {
  async init(): Promise<InitReport> {
    const t0 = performance.now();
    gcs = await make_gcs_wrapper(gcsWasmUrl);
    const t1 = performance.now();
    const OC = await opencascade({ locateFile: () => ocWasmUrl });
    setOC(OC);
    const t2 = performance.now();
    return {
      gcsInitMs: t1 - t0,
      ocInitMs: t2 - t1,
      wasm: wasmResources(),
    };
  },

  async rebuild(params: PlateParams, keepPrevious: boolean): Promise<RebuildResult> {
    if (!gcs) throw new Error("init() を先に呼んでください");
    const problems = validateParams(params);
    if (problems.length > 0) return { kind: "invalid", problems };

    // 前回の形を初期値にすると、実際のスケッチ操作と同じく少しずつ形が動く
    const sketch = solvePlateSketch(gcs, params, keepPrevious ? lastCorners : undefined);
    if (!sketch.ok) {
      return {
        kind: "invalid",
        problems: ["寸法の組み合わせで形が決まりませんでした。最後に変えた寸法を元に戻してください。"],
        sketch,
      };
    }
    lastCorners = sketch.corners;

    const t0 = performance.now();
    let shape: Shape3D;
    try {
      shape = buildPlate(sketch, { thickness: params.thickness, cornerRadius: params.cornerRadius });
    } catch (err) {
      return {
        kind: "invalid",
        problems: ["この寸法では立体を作れませんでした。角の丸みや穴の位置を少し変えてみてください。"],
        sketch,
        detail: String(err),
      };
    }
    const t1 = performance.now();
    const mesh = meshShape(shape);
    const t2 = performance.now();

    currentShape?.delete();
    currentShape = shape;

    const result: RebuildResult = {
      kind: "ok",
      sketch,
      mesh,
      timings: { solveMs: sketch.solveMs, buildMs: t1 - t0, meshMs: t2 - t1 },
      triangleCount: mesh.triangles.length / 3,
    };
    return Comlink.transfer(result, [
      mesh.vertices.buffer,
      mesh.normals.buffer,
      mesh.triangles.buffer,
      mesh.edges.buffer,
    ]);
  },

  async exportSTL(): Promise<ArrayBuffer> {
    if (!currentShape) throw new Error("まだ形がありません");
    const blob = currentShape.blobSTL({ binary: true, tolerance: 0.02, angularTolerance: 10 });
    const buf = await blob.arrayBuffer();
    return Comlink.transfer(buf, [buf]);
  },
};

export type CadWorkerApi = typeof api;

Comlink.expose(api);
