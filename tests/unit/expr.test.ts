import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/app/expr";

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
