// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/doc/expr";
import { digitsOnly } from "../../src/app/author";

describe("evaluate", () => {
  it.each([
    ["25", 25],
    ["25/2", 12.5],
    ["10+5×2", 20],
    ["(10+5)*2", 30],
    ["-3+4", 1],
    ["１２．５", 12.5],
    [".5", 0.5],
  ])("%s = %d", (src, v) => expect(evaluate(src)).toBeCloseTo(v));

  it.each(["", "abc", "1+", "(1", "1/0"])("%s は数にならない", (src) => expect(evaluate(src)).toBeNull());
});

// 2026-11-22 日本語入力のまま打った全角の記号でも計算できる
describe("全角の数字・記号", () => {
  it.each([
    ["２５／２", 12.5],
    ["（１０＋５）＊２", 30],
    ["１０－４", 6],
    ["−3+4", 1],
    ["１ ０", 10],
  ])("%s = %d", (src, v) => expect(evaluate(src)).toBeCloseTo(v));

  it("全角の英字の変数名も使える", () => expect(evaluate("Ｗ／２", { W: 40 })).toBe(20));
});

describe("digitsOnly(学籍番号)", () => {
  it("全角の数字を半角にし、数字以外をのぞく", () => expect(digitsOnly("２３-１２")).toBe("2312"));
});
