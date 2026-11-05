// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/** 変数の名前に使える文字: ひらがな・カタカナ・漢字・英字・_ で始まり、数字も続けられる */
export const NAME_PATTERN = /^[A-Za-z_\u3040-\u30ff\u3400-\u9fff][A-Za-z0-9_\u3040-\u30ff\u3400-\u9fff]*/u;

export function isValidName(name: string): boolean {
  const m = NAME_PATTERN.exec(name);
  return !!m && m[0] === name;
}

/**
 * 寸法の入力欄で使う、かんたんな計算式(+ - × ÷ とかっこ、変数の名前)。
 * 例: "25/2" → 12.5、vars に { 幅: 40 } があれば "幅/2" → 20。eval は使わない。
 * 計算できないとき(知らない名前、0 で割る など)は null。
 */
export function evaluate(input: string, vars: Record<string, number> = {}): number | null {
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
    const name = NAME_PATTERN.exec(src.slice(i));
    if (name) {
      i += name[0].length;
      return Object.hasOwn(vars, name[0]) ? vars[name[0]] : null;
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

/** 式の中で使っている変数の名前 */
export function namesIn(input: string): string[] {
  const out: string[] = [];
  const re = new RegExp(NAME_PATTERN.source.slice(1), "gu");
  for (const m of input.matchAll(re)) out.push(m[0]);
  return out;
}
