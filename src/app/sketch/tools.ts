// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// スケッチの道具の一覧と、画面に出す案内の言葉。
// 2026-11-22 SketchEditor.tsx から分けた(SketchEditor.tsx は操作の処理だけにして読みやすくするため)。
// 道具を足すときや、案内の言葉を直すときは、このファイルだけを見ればよい。

import type { SketchConstraint } from "../../doc/types";
import type { IconName } from "../Icon";

export type Tool = "select" | "line" | "rect" | "circle" | "arc" | "polygon" | "text" | "dimension";

/** きまりの記号をえらんだときに出す、意味の説明 */
export const CONSTRAINT_MEANING: Partial<Record<SketchConstraint["type"], string>> = {
  horizontal: "この線はまっすぐ横",
  vertical: "この線はまっすぐ縦",
  parallel: "2本の線は同じ向き",
  perpendicular: "2本の線は直角に交わる",
  equal: "2つは同じ長さ(同じ大きさ)",
};

export const TOOLS: { tool: Tool; label: string; icon: IconName; hint: string }[] = [
  { tool: "select", label: "えらぶ", icon: "select", hint: "点や線をタップしてえらびます。点はドラッグで動かせます。何もないところをドラッグすると画面が動きます" },
  { tool: "line", label: "線", icon: "line", hint: "点をタップしてつなげていきます。始めの点をタップすると形が閉じます" },
  { tool: "rect", label: "長方形", icon: "rect", hint: "角をタップしてから、反対の角をタップします" },
  { tool: "circle", label: "円", icon: "circle", hint: "中心をタップしてから、大きさを決める点をタップします" },
  { tool: "arc", label: "円弧", icon: "arc", hint: "中心 → 始まり → 終わりの順にタップします(左回りにかけます)" },
  { tool: "polygon", label: "多角形", icon: "polygon", hint: "中心をタップしてから、角の1つをタップします" },
  { tool: "text", label: "文字", icon: "text", hint: "文字を置きたいところ(文字の左下)をタップします。名札は、板の上の面にかいてから押し出します" },
  { tool: "dimension", label: "寸法", icon: "dimension", hint: "線をタップすると長さ、円をタップすると直径を入れられます。点を2つタップすると距離です" },
];

/** 1つ目の点を置いたあとの案内 */
export function nextStepHint(tool: Tool, placed: number): string | null {
  const slide = "(指を置いたまま動かすと、大きさを見ながら決められます)";
  if (tool === "line") return `次の点をタップ${slide}`;
  if (tool === "rect") return `反対の角をタップ${slide}`;
  if (tool === "circle" || tool === "polygon") return `大きさを決める点をタップ${slide}`;
  if (tool === "arc") return placed === 1 ? "円弧の始まりの点をタップ" : "円弧の終わりの点をタップ";
  return null;
}
