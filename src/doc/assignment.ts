// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 課題の条件を、いまの作品で確かめる。
// 形の大きさ・体積は Worker で計算した値(Measure)を使い、ここでは計算しない。

import type { AssignmentCheck, CadDocument, WorldAxis } from "./types";

/** 立体の大きさ(mm)と体積(mm³) */
export interface Measure {
  size: [number, number, number];
  volume: number;
}

export interface CheckResult {
  id: string;
  /** 生徒に見せる条件の文(例: 「はばが 50〜60 mm」) */
  label: string;
  ok: boolean;
  /** いまの値(例: 「いまは 48 mm」) */
  detail: string;
}

export const AXIS_WORDS: Record<WorldAxis, string> = { x: "はば", y: "奥行き", z: "高さ" };

export const USE_WORDS: Record<Extract<AssignmentCheck, { kind: "uses" }>["feature"], string> = {
  extrude: "押し出し",
  revolve: "回転",
  fillet: "角を丸める・落とす",
  mirror: "対称にする",
  pattern: "ならべる",
  loft: "つなぐ(ロフト)",
  shell: "くりぬく",
  sweep: "なぞる(スイープ)",
  text: "文字",
};

/** 「50〜60」「50 以上」「60 以下」のように、はんいを言葉にする */
export function rangeText(min: number | undefined, max: number | undefined, unit: string): string {
  if (min !== undefined && max !== undefined) return min === max ? `${fmt(min)} ${unit}` : `${fmt(min)}〜${fmt(max)} ${unit}`;
  if (min !== undefined) return `${fmt(min)} ${unit} 以上`;
  if (max !== undefined) return `${fmt(max)} ${unit} 以下`;
  return "いくつでもよい";
}

export function checkLabel(c: AssignmentCheck): string {
  if (c.kind === "size") return `${AXIS_WORDS[c.axis]}が ${rangeText(c.min, c.max, "mm")}`;
  if (c.kind === "volume") return `体積が ${rangeText(c.min, c.max, "cm³")}`;
  return `「${USE_WORDS[c.feature]}」を使う`;
}

/**
 * 課題の条件を1つずつ確かめる。
 * 大きさは、形がぴったりの寸法になるよう 0.05 mm の誤差を許す(画面の丸めで 59.999 になることがあるため)。
 */
export function evaluateChecks(doc: CadDocument, measure: Measure | null): CheckResult[] {
  return (doc.assignment?.checks ?? []).map((c) => {
    const label = checkLabel(c);
    if (c.kind === "uses") {
      const used =
        c.feature === "text"
          ? doc.features.some((f) => f.type === "sketch" && f.entities.some((e) => e.type === "text"))
          : doc.features.some((f) => f.type === c.feature);
      return { id: c.id, label, ok: used, detail: used ? "使っています" : "まだ使っていません" };
    }
    if (!measure) return { id: c.id, label, ok: false, detail: "まだ立体がありません" };
    const value = c.kind === "size" ? measure.size[{ x: 0, y: 1, z: 2 }[c.axis]] : measure.volume / 1000;
    const tol = c.kind === "size" ? 0.05 : 0.005;
    const ok = (c.min === undefined || value >= c.min - tol) && (c.max === undefined || value <= c.max + tol);
    return { id: c.id, label, ok, detail: `いまは ${fmt(value)} ${c.kind === "size" ? "mm" : "cm³"}` };
  });
}

/** 小数を見やすく(小数第1位まで、0 は書かない) */
export function fmt(v: number): string {
  return String(Math.round(v * 10) / 10);
}
