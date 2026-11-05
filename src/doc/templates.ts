// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 新しく始めるときにえらべる課題のひな形。
// 先生はこれを開いて説明や条件を変え、「課題ファイル」として保存して配れる。

import type { Assignment, CadDocument, ExtrudeFeature, Feature, SketchFeature } from "./types";
import { emptyDocument } from "./types";

export interface Template {
  id: string;
  label: string;
  icon: string;
  /** えらぶ画面に出す短い説明 */
  summary: string;
  make: () => CadDocument;
}

/** 原点を左下にした w×h の長方形(寸法つきで、形が決まっている) */
function rectSketch(id: string, name: string, w: number, h: number): SketchFeature {
  return {
    id,
    type: "sketch",
    name,
    plane: { kind: "base", name: "top" },
    entities: [
      { id: `${id}a`, type: "point", x: 0, y: 0 },
      { id: `${id}b`, type: "point", x: w, y: 0 },
      { id: `${id}c`, type: "point", x: w, y: h },
      { id: `${id}d`, type: "point", x: 0, y: h },
      { id: `${id}l1`, type: "line", p1: `${id}a`, p2: `${id}b` },
      { id: `${id}l2`, type: "line", p1: `${id}b`, p2: `${id}c` },
      { id: `${id}l3`, type: "line", p1: `${id}c`, p2: `${id}d` },
      { id: `${id}l4`, type: "line", p1: `${id}d`, p2: `${id}a` },
    ],
    constraints: [
      { id: `${id}k0`, type: "coincident", a: `${id}a`, b: "origin" },
      { id: `${id}k1`, type: "horizontal", line: `${id}l1` },
      { id: `${id}k2`, type: "horizontal", line: `${id}l3` },
      { id: `${id}k3`, type: "vertical", line: `${id}l2` },
      { id: `${id}k4`, type: "vertical", line: `${id}l4` },
      { id: `${id}k5`, type: "length", line: `${id}l1`, value: w },
      { id: `${id}k6`, type: "length", line: `${id}l2`, value: h },
    ],
  };
}

function extrude(id: string, name: string, sketchId: string, distance: number): ExtrudeFeature {
  return { id, type: "extrude", name, sketchId, distance, operation: "add", flip: false };
}

function withAssignment(name: string, assignment: Assignment, features: Feature[] = []): CadDocument {
  return { ...emptyDocument(name), features, assignment };
}

let n = 0;
const cid = () => `c${++n}`;

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "白紙",
    icon: "📄",
    summary: "何もないところから自由に作る",
    make: () => emptyDocument(),
  },
  {
    id: "nameplate",
    label: "名札",
    icon: "🏷️",
    summary: "板の上に名前を浮き出させる。板は用意してあります",
    make: () =>
      withAssignment(
        "名札",
        {
          title: "名札を作ろう",
          instructions:
            "用意してある板の上の面に、スケッチの「文字」で自分の名前をかき、1mm 押し出して浮き出させましょう。\n板の角を丸めると、手にやさしい名札になります。",
          checks: [
            { id: cid(), kind: "size", axis: "x", min: 50, max: 80 },
            { id: cid(), kind: "size", axis: "y", min: 15, max: 30 },
            { id: cid(), kind: "uses", feature: "text" },
            { id: cid(), kind: "uses", feature: "fillet" },
          ],
        },
        [rectSketch("sk1", "板の形", 60, 20), extrude("ex1", "板", "sk1", 3)],
      ),
  },
  {
    id: "coaster",
    label: "コースター",
    icon: "🥤",
    summary: "コップの下にしく、うすい円や多角形の板",
    make: () =>
      withAssignment("コースター", {
        title: "コースターを作ろう",
        instructions: "直径 80〜100mm、あつさ 3〜6mm のコースターを作りましょう。\n穴やもようを「ならべる」で入れると、すっきりした形になります。",
        checks: [
          { id: cid(), kind: "size", axis: "x", min: 80, max: 100 },
          { id: cid(), kind: "size", axis: "y", min: 80, max: 100 },
          { id: cid(), kind: "size", axis: "z", min: 3, max: 6 },
          { id: cid(), kind: "uses", feature: "pattern" },
        ],
      }),
  },
  {
    id: "penstand",
    label: "ペン立て",
    icon: "✏️",
    summary: "材料の量(体積)に気をつけて、ペンが入る入れ物を作る",
    make: () =>
      withAssignment("ペン立て", {
        title: "ペン立てを作ろう",
        instructions:
          "高さ 80〜120mm のペン立てを作りましょう。\n3Dプリンターの材料を使いすぎないよう、体積は 150cm³ 以下にします。中を「けずる」でくりぬくと体積が減ります。",
        checks: [
          { id: cid(), kind: "size", axis: "z", min: 80, max: 120 },
          { id: cid(), kind: "volume", max: 150 },
        ],
      }),
  },
  {
    id: "keyholder",
    label: "キーホルダー",
    icon: "🔑",
    summary: "ひもを通す穴のある、小さな飾り",
    make: () =>
      withAssignment("キーホルダー", {
        title: "キーホルダーを作ろう",
        instructions: "50mm × 50mm に入る大きさで、あつさ 2〜5mm のキーホルダーを作りましょう。\nひもを通す穴(直径 4mm くらい)を「けずる」で開けるのをわすれずに。",
        checks: [
          { id: cid(), kind: "size", axis: "x", max: 50 },
          { id: cid(), kind: "size", axis: "y", max: 50 },
          { id: cid(), kind: "size", axis: "z", min: 2, max: 5 },
        ],
      }),
  },
];
