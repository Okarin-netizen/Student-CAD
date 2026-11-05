// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/**
 * 寸法の入力欄で使う、かんたんな計算式(+ - × ÷ とかっこ)。
 * 例: "25/2" → 12.5。eval は使わない。
 */
export function evaluate(input: string): number | null {
  const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s+/g, "").replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  let i = 0;
  const peek = () => src[i];
  const num = (): number | null => {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      const v = num();
      return v == null ? null : -v;
    }
    const m = /^\d+(\.\d*)?|^\.\d+/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const term = (): number | null => {
    let v = num();
    while (v != null && (peek() === "*" || peek() === "/")) {
      const op = src[i++];
      const r = num();
      if (r == null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v != null && (peek() === "+" || peek() === "-")) {
      const op = src[i++];
      const r = term();
      if (r == null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  return v != null && i === src.length && Number.isFinite(v) ? v : null;
}
