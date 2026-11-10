// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 下の手順バーで「次に押すボタン」と「まだ使えないボタン」を決める。2026-11-10 追加。
// はじめて使う生徒が「次どこ押すの?」と迷わないように、いま押すとよいボタンを1つだけ青くする。
// まだ使えないボタンはうすく見せ、押したら赤ではなく、ふつうの色で何を先にするかを伝える。

import { usedSketchIds } from "../doc/links";
import type { CadDocument, SketchFeature } from "../doc/types";
import { findProfiles } from "../sketch/profiles";
import { term } from "./terms";

/** 手順バーのボタン */
export type StepButton = "sketch" | "extrude" | "revolve" | "fillet" | "more" | "export";

export interface StepGuide {
  /** 次に押すとよいボタン(青くする) */
  next: StepButton;
  /** まだ使えないボタンと、押したときに出す案内 */
  notReady: Partial<Record<StepButton, string>>;
}

/** 押したボタンが まだ使えないときの案内(ボタンの名前は、画面の言葉にあわせる) */
const hints = (pro: boolean) => ({
  sketch: `先に 1 の「${term("newSketch", pro)}」をおしてね`,
  shape: `先に 1 の「${term("newSketch", pro)}」で、閉じた形(長方形や円など)をかいてね`,
  body: `先に 2 の「${term("extrude", pro)}」で立体を作ってね`,
});

/**
 * 設計図 doc と、立体ができているか hasBody から、手順バーの見え方を決める。pro は専門用語で表示するか。
 * - 絵がない → 「絵をかく」が次。立体にする・回転・角を丸める・そのほか はまだ使えない
 * - まだ立体に使っていない絵がある → 「立体にする」が次(補助線の軸があれば「回転」)
 * - 立体ができた → 「書き出す」が次
 */
export function stepGuide(doc: CadDocument, hasBody: boolean, pro = false): StepGuide {
  const sketches = doc.features.filter((f): f is SketchFeature => f.type === "sketch");
  const hasShape = (sk: SketchFeature) => findProfiles(sk).regions.length > 0;
  const hasText = (sk: SketchFeature) => sk.entities.some((e) => e.type === "text");
  const canExtrude = sketches.some((sk) => hasShape(sk) || hasText(sk));
  const canRevolve = sketches.some(hasShape);

  const say = hints(pro);
  const notReady: StepGuide["notReady"] = {};
  if (!canExtrude) notReady.extrude = sketches.length === 0 ? say.sketch : say.shape;
  if (!canRevolve) notReady.revolve = sketches.length === 0 ? say.sketch : say.shape;
  if (!hasBody) notReady.fillet = canExtrude ? say.body : say.sketch;
  // 「そのほか」の中には、絵が2つあれば使える「つなぐ」「なぞる」もあるので、絵が1つでもあれば開ける
  if (!hasBody && sketches.length === 0) notReady.more = say.sketch;

  const used = usedSketchIds(doc);
  const waiting = sketches.filter((sk) => !used.has(sk.id) && (hasShape(sk) || hasText(sk)));
  // 補助線(軸)をかいた絵は「回して立体にする」をすすめる(nextStep.ts と同じ決まり)
  const hasAxis = (sk: SketchFeature) => sk.entities.some((e) => e.type === "line" && e.construction);
  const last = waiting.at(-1);
  let next: StepButton = hasBody ? "export" : "sketch";
  if (last) next = hasShape(last) && hasAxis(last) ? "revolve" : "extrude";
  return { next, notReady };
}
