// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import { dependents, usedSketchIds } from "../../src/doc/links";
import type { ExtrudeFeature, SketchFeature } from "../../src/doc/types";
import { nextStepAfterSketch } from "../../src/app/nextStep";
import { docWith, rectSketch } from "./fixtures";

const extrude = (id: string, sketchId: string): ExtrudeFeature => ({ id, type: "extrude", name: id, sketchId, distance: 10, operation: "add", flip: false });

describe("作業のつながり", () => {
  it("スケッチを消すと、それを使う押し出しと、それをならべたパターンも消える", () => {
    const doc = docWith(rectSketch(10, 10), extrude("e1", "sk1"), {
      id: "p1",
      type: "pattern",
      name: "p1",
      source: "e1",
      kind: "linear",
      axis: "x",
      flip: false,
      count: 2,
      spacing: 20,
    } as never);
    expect(dependents(doc, "sk1").map((f) => f.id)).toEqual(["e1", "p1"]);
    expect(usedSketchIds(doc).has("sk1")).toBe(true);
  });
});

describe("「かけた!」のあとの作業", () => {
  it("閉じた形は押し出し、軸があれば回転、もう使っていれば何もしない", () => {
    const sk = rectSketch(10, 10);
    expect(nextStepAfterSketch(docWith(), sk).kind).toBe("extrude");
    const withAxis: SketchFeature = {
      ...sk,
      entities: [...sk.entities, { id: "x1", type: "point", x: 0, y: -5 }, { id: "x2", type: "point", x: 0, y: 20 }, { id: "ax", type: "line", p1: "x1", p2: "x2", construction: true }],
    };
    expect(nextStepAfterSketch(docWith(), withAxis).kind).toBe("revolve");
    expect(nextStepAfterSketch(docWith(sk, extrude("e1", "sk1")), sk).kind).toBe("none");
  });

  it("何もかいていなければ案内を出す", () => {
    const empty: SketchFeature = { ...rectSketch(10, 10), entities: [], constraints: [] };
    expect(nextStepAfterSketch(docWith(), empty)).toEqual({ kind: "hint", text: "閉じた形がないので、まだ立体にはできません" });
  });
});
