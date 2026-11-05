// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, validateParams } from "../../src/bench/params";

describe("validateParams", () => {
  it("初期値は作れる形", () => {
    expect(validateParams(DEFAULT_PARAMS)).toEqual([]);
  });

  it("穴がふちからはみ出すと日本語で知らせる", () => {
    const problems = validateParams({ ...DEFAULT_PARAMS, holeX: 2 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("左右のふち");
  });

  it("角の丸みが短い辺の半分以上だと作れない", () => {
    expect(validateParams({ ...DEFAULT_PARAMS, cornerRadius: 15 })[0]).toContain("角の丸み");
  });

  it("範囲外の数字を知らせる", () => {
    expect(validateParams({ ...DEFAULT_PARAMS, width: 0 })[0]).toContain("よこの長さ");
  });
});
