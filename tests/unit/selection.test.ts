// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// えらんだものや途中の操作が残ってしまうバグの再発を防ぐテスト(2026-11-13)

import { describe, expect, it } from "vitest";
import { cancelMode, defaultRevolveAxis, getState, replaceDoc, setState, updateOp } from "../../src/app/store";
import { emptyDocument, type FilletFeature, type SketchFeature } from "../../src/doc/types";

const sketch = (id: string, withAxis: boolean): SketchFeature => ({
  id,
  type: "sketch",
  name: id,
  plane: { kind: "base", name: "front" },
  entities: [
    { id: `${id}a`, type: "point", x: 0, y: 0 },
    { id: `${id}b`, type: "point", x: 0, y: 10 },
    { id: `${id}l`, type: "line", p1: `${id}a`, p2: `${id}b`, construction: withAxis },
  ],
  constraints: [],
});

describe("回す軸", () => {
  it("補助線があるスケッチは補助線、ないスケッチは たての軸 になる", () => {
    expect(defaultRevolveAxis(sketch("s1", true))).toEqual({ kind: "line", line: "s1l" });
    expect(defaultRevolveAxis(sketch("s2", false))).toEqual({ kind: "y" });
    expect(defaultRevolveAxis(undefined)).toEqual({ kind: "y" });
  });
});

describe("丸める ⇔ 落とす の切りかえ", () => {
  const fillet = (name: string): FilletFeature => ({ id: "fl9", type: "fillet", name, kind: "fillet", radius: 2, edges: [] });

  it("自動でつけた名前は、切りかえた作業の名前になる(ほかの作業と重ならない)", () => {
    replaceDoc({ ...emptyDocument(), features: [{ ...fillet("面取り1"), id: "old" }] });
    setState({ mode: { kind: "op", isNew: true }, draftOp: fillet("丸め1") });
    updateOp({ kind: "chamfer" });
    expect(getState().draftOp!.name).toBe("面取り2");
    updateOp({ kind: "fillet" });
    expect(getState().draftOp!.name).toBe("丸め1");
    cancelMode();
  });

  it("自分でつけた名前は変えない", () => {
    replaceDoc(emptyDocument());
    setState({ mode: { kind: "op", isNew: true }, draftOp: fillet("取っ手の角") });
    updateOp({ kind: "chamfer" });
    expect(getState().draftOp!.name).toBe("取っ手の角");
    cancelMode();
  });
});
