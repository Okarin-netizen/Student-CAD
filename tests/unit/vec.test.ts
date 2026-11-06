// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import { cross3, distToSegment, dot3, normalize3 } from "../../src/math/vec";

describe("ベクトル計算", () => {
  it("外積は右手の向き(X × Y = Z)", () => {
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(normalize3([0, 3, 4])).toEqual([0, 0.6, 0.8]);
    expect(normalize3([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("点から線分までの距離(はしの外は はしまでの距離)", () => {
    expect(distToSegment([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distToSegment([13, 4], [0, 0], [10, 0])).toBe(5);
    expect(distToSegment([3, 4], [0, 0], [0, 0])).toBe(5);
  });
});
