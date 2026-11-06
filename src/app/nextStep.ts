// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { usedSketchIds } from "../doc/links";
import type { CadDocument, SketchFeature } from "../doc/types";
import { findProfiles } from "../sketch/profiles";

/** スケッチを「かけた!」のあとに、自動で始める作業(または出す案内) */
export type NextStep =
  | { kind: "extrude" | "revolve" | "loft" | "sweep" }
  | { kind: "hint"; text: string }
  | { kind: "none" };

/**
 * かき終えたスケッチ sk から、次にする作業をえらぶ。doc は、かき終える前の設計図。
 * - もう押し出し・回転に使っているスケッチなら、何もしない(なおしただけ)
 * - ずらした面に形を1つかき、ほかにまだ使っていない形がある → つなぐ(ロフト)
 * - 形を1つかき、ほかにまだ使っていない道すじ(閉じていない線)がある → なぞる(スイープ)
 * - 補助線(軸)がある → 回転、それ以外の閉じた形や文字 → 押し出し
 * - 閉じていない線だけ → ほかに形があれば なぞる、なければ案内を出す
 */
export function nextStepAfterSketch(doc: CadDocument, sk: SketchFeature): NextStep {
  const used = doc.features.some((f) => (f.type === "extrude" || f.type === "revolve") && f.sketchId === sk.id);
  if (used) return { kind: "none" };

  const own = findProfiles(sk);
  const regions = own.regions.length;
  const paths = own.paths.length;
  // 補助線(軸)をかいたスケッチは回転、それ以外は押し出しをすすめる
  const hasAxis = sk.entities.some((e) => e.type === "line" && e.construction);
  // 文字だけのスケッチ(名札の文字など)も押し出せる
  const hasText = sk.entities.some((e) => e.type === "text");

  // ほかの、まだ立体に使っていないスケッチ(閉じた形があるか・道すじがあるか)
  const usedIds = usedSketchIds(doc);
  const others = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && f.id !== sk.id && !usedIds.has(f.id)).map((f) => findProfiles(f));
  const otherShape = others.some((p) => p.regions.length > 0);
  const otherPath = others.some((p) => p.paths.length > 0 && p.regions.length === 0);

  if (regions === 1 && sk.plane.kind === "offset" && otherShape) return { kind: "loft" };
  // 道すじをかいたあとに断面をかいたら「なぞる」
  if (regions === 1 && otherPath) return { kind: "sweep" };
  if (regions > 0 && hasAxis) return { kind: "revolve" };
  if (regions > 0 || hasText) return { kind: "extrude" };
  if (paths > 0) {
    // 閉じていない線だけのスケッチは、なぞるの道すじに使える
    if (otherShape) return { kind: "sweep" };
    return { kind: "hint", text: "閉じていない線は「なぞる」の道すじに使えます。次に、どこかの面の原点のまわりに断面の形(円など)をかきましょう" };
  }
  return { kind: "hint", text: "閉じた形がないので、まだ立体にはできません" };
}
