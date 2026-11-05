// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/// <reference lib="webworker" />
// 作業のれきしからの形の計算(拘束計算 + OpenCascade)は、すべてこの Web Worker で行う。
import * as Comlink from "comlink";
import opencascade from "replicad-opencascadejs";
import ocWasmUrl from "replicad-opencascadejs/wasm?url";
import { loadFont, setOC, type Shape3D } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { TEXT_FONT, meshBody, rebuild, usesText, type BodyMesh, type FeatureStatus, type SketchDisplay } from "../kernel/rebuild";
import type { CadDocument } from "../doc/types";

export interface RebuildReply {
  statuses: FeatureStatus[];
  mesh: BodyMesh | null;
  sketches: SketchDisplay[];
  ms: number;
}

let gcs: GcsWrapper | null = null;
let body: Shape3D | null = null;
let ready: Promise<void> | null = null;

function init() {
  ready ??= (async () => {
    gcs = await make_gcs_wrapper(gcsWasmUrl);
    setOC(await opencascade({ locateFile: () => ocWasmUrl }));
  })();
  return ready;
}

/** 文字のフォント(M PLUS Rounded 1c Bold、SIL OFL 1.1)。文字を使うときだけ読み込む(約3.5MB) */
const FONT_URL = `${import.meta.env.BASE_URL}fonts/MPLUSRounded1c-Bold.ttf`;
let font: Promise<unknown> | null = null;

async function ensureFont() {
  font ??= loadFont(FONT_URL, TEXT_FONT).catch((err) => {
    // 失敗したら次の計算でもう一度試す。今回は文字なしで計算され、作業にエラーが出る
    console.warn(err);
    font = null;
  });
  await font;
}

const api = {
  init,

  async rebuild(doc: CadDocument): Promise<RebuildReply> {
    await init();
    if (usesText(doc)) await ensureFont();
    const t0 = performance.now();
    const out = rebuild(doc, gcs!);
    body?.delete();
    body = out.body;
    const mesh = out.body ? meshBody(out.body) : null;
    const reply: RebuildReply = { statuses: out.statuses, mesh, sketches: out.sketches, ms: performance.now() - t0 };
    const transfers: Transferable[] = out.sketches.map((s) => s.lines.buffer as ArrayBuffer);
    if (mesh) transfers.push(mesh.vertices.buffer, mesh.normals.buffer, mesh.triangles.buffer, mesh.edges.buffer);
    return Comlink.transfer(reply, transfers);
  },

  async exportSTEP(): Promise<ArrayBuffer | null> {
    if (!body) return null;
    const buf = await body.blobSTEP().arrayBuffer();
    return Comlink.transfer(buf, [buf]);
  },

  async exportSTL(): Promise<ArrayBuffer | null> {
    if (!body) return null;
    const buf = await body.blobSTL({ binary: true, tolerance: 0.02, angularTolerance: 8 }).arrayBuffer();
    return Comlink.transfer(buf, [buf]);
  },
};

export type CadWorkerApi = typeof api;
Comlink.expose(api);
