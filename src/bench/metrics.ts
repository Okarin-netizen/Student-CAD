// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import type { InitReport, Timings } from "./types";

/** 実機で計測した結果。この JSON をコピーして共有してもらう。 */
export interface MetricsReport {
  measuredAt: string;
  device: {
    userAgent: string;
    cores: number | null;
    /** Chrome 系のみ。GB 単位のおおよその値 */
    deviceMemoryGB: number | null;
    screen: string;
    pixelRatio: number;
    touchPoints: number;
  };
  /** ページを開いてから準備完了まで (ms) */
  readyMs: number | null;
  init: InitReport | null;
  /** 最後の再計算 */
  last: (Timings & { triangles: number }) | null;
  /** 連続テストの結果 */
  stress: StressResult | null;
  /** Chrome 系のみ。JS ヒープの使用量 (MB) */
  jsHeapMB: number | null;
}

export interface StressResult {
  runs: number;
  avgTotalMs: number;
  maxTotalMs: number;
  avgSolveMs: number;
  avgBuildMs: number;
  avgMeshMs: number;
  failures: number;
}

export function deviceInfo(): MetricsReport["device"] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    cores: nav.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    touchPoints: nav.maxTouchPoints ?? 0,
  };
}

export function jsHeapMB(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null;
}

export const ms = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} ms`);
