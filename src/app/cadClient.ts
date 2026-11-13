// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import * as Comlink from "comlink";
import type { CadWorkerApi, RebuildReply } from "../worker/cad.worker";
import type { CadDocument } from "../doc/types";
import type { DrawingKind } from "../kernel/projection";

/**
 * Worker への窓口。設計図が続けて変わったときは、待っている分を捨てて最新だけ計算する。
 */
export class CadClient {
  private api: Comlink.Remote<CadWorkerApi>;
  private worker: Worker;
  private pending: CadDocument | null = null;
  private running = false;
  /** 計算できた形。doc は、その形を計算した設計図(画面の形が最新かどうかを見るのに使う) */
  onResult: (r: RebuildReply, doc: CadDocument) => void = () => {};
  onBusy: (busy: boolean) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL("../worker/cad.worker.ts", import.meta.url), { type: "module" });
    this.api = Comlink.wrap<CadWorkerApi>(this.worker);
  }

  init() {
    return this.api.init();
  }

  request(doc: CadDocument) {
    this.pending = doc;
    void this.pump();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    this.onBusy(true);
    try {
      while (this.pending) {
        const doc = this.pending;
        this.pending = null;
        const r = await this.api.rebuild(doc);
        if (!this.pending) this.onResult(r, doc);
      }
    } finally {
      this.running = false;
      this.onBusy(false);
    }
  }

  exportSTL() {
    return this.api.exportSTL();
  }

  exportSTEP() {
    return this.api.exportSTEP();
  }

  export3MF(title: string) {
    return this.api.export3MF(title);
  }

  drawing(kind: DrawingKind, withHidden: boolean) {
    return this.api.drawing(kind, withHidden);
  }

  terminate() {
    this.worker.terminate();
  }
}
