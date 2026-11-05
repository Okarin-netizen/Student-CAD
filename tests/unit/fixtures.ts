// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import type { CadDocument, SketchConstraint, SketchEntity, SketchFeature } from "../../src/doc/types";

/** 原点を左下にした w×h の長方形(寸法つき)と、中心に直径 d の円 */
export function rectSketch(w: number, h: number, d = 0, id = "sk1"): SketchFeature {
  const entities: SketchEntity[] = [
    { id: "a", type: "point", x: 0.3, y: -0.2 },
    { id: "b", type: "point", x: w + 2, y: 1 },
    { id: "c", type: "point", x: w - 1, y: h + 2 },
    { id: "d", type: "point", x: -1, y: h - 1 },
    { id: "l1", type: "line", p1: "a", p2: "b" },
    { id: "l2", type: "line", p1: "b", p2: "c" },
    { id: "l3", type: "line", p1: "c", p2: "d" },
    { id: "l4", type: "line", p1: "d", p2: "a" },
  ];
  const constraints: SketchConstraint[] = [
    { id: "k0", type: "coincident", a: "a", b: "origin" },
    { id: "k1", type: "horizontal", line: "l1" },
    { id: "k2", type: "horizontal", line: "l3" },
    { id: "k3", type: "vertical", line: "l2" },
    { id: "k4", type: "vertical", line: "l4" },
    { id: "k5", type: "length", line: "l1", value: w },
    { id: "k6", type: "length", line: "l2", value: h },
  ];
  if (d > 0) {
    entities.push({ id: "cc", type: "point", x: w / 2 + 1, y: h / 2 }, { id: "ci", type: "circle", c: "cc", r: d / 2 + 1 });
    constraints.push(
      { id: "k7", type: "diameter", circle: "ci", value: d },
      { id: "k8", type: "distance", a: "cc", b: "a", value: Math.hypot(w / 2, h / 2) },
    );
  }
  return { id, type: "sketch", name: "スケッチ1", plane: { kind: "base", name: "top" }, entities, constraints };
}

export function docWith(...features: CadDocument["features"]): CadDocument {
  return { format: "student-cad", version: 1, name: "test", features };
}
