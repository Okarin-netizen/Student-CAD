// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 変数(名前のついた数)を計算して、それを使っている寸法や作業の数を計算し直す。
// 設計図には計算結果(value)も一緒に入れておくので、ここ以外は変数を気にしなくてよい。

import { evaluate, isValidName, namesIn } from "./expr";
import { isDimension, type CadDocument, type Feature, type NumberExprs, type Variable } from "./types";

export type VariableValues = Record<string, number>;

/**
 * 変数を上から順に計算する(式で使えるのは、それより上の変数だけ)。
 * 計算できない変数は values に入らず、errors に理由が入る。
 */
export function evaluateVariables(variables: Variable[] = []): { values: VariableValues; errors: Record<string, string> } {
  const values: VariableValues = {};
  const errors: Record<string, string> = {};
  for (const v of variables) {
    if (!isValidName(v.name)) {
      errors[v.id] = "名前は文字で始めてください(数字・記号から始められません)";
      continue;
    }
    const value = evaluate(v.expr, values);
    if (value == null) {
      const unknown = namesIn(v.expr).filter((n) => !(n in values));
      errors[v.id] = unknown.length > 0 ? `「${unknown.join("」「")}」は、この変数より上にありません` : "式が計算できません";
      continue;
    }
    values[v.name] = value;
  }
  return { values, errors };
}

/** 変数を変えたあとに、式を使っている寸法と作業の数を計算し直した設計図を返す */
export function applyVariables(doc: CadDocument): CadDocument {
  const { values } = evaluateVariables(doc.variables);
  const variables = (doc.variables ?? []).map((v) => (v.name in values ? { ...v, value: values[v.name] } : v));
  const features = doc.features.map((f) => applyToFeature(f, values));
  return { ...doc, variables, features };
}

function applyToFeature(f: Feature, values: VariableValues): Feature {
  if (f.type === "sketch") {
    let changed = false;
    const constraints = f.constraints.map((c) => {
      if (!isDimension(c) || !c.expr) return c;
      const v = evaluate(c.expr, values);
      if (v == null || v === Math.abs(c.value)) return c;
      changed = true;
      // 角度は向き(符号)を保つ
      return { ...c, value: c.type === "angle" && c.value < 0 ? -v : v };
    });
    return changed ? { ...f, constraints } : f;
  }
  if (!("exprs" in f) || !f.exprs) return f;
  const patch: Record<string, number> = {};
  for (const [key, expr] of Object.entries(f.exprs as NumberExprs)) {
    if (!expr) continue;
    const v = evaluate(expr, values);
    if (v != null && (f as unknown as Record<string, unknown>)[key] !== v) patch[key] = v;
  }
  return Object.keys(patch).length > 0 ? ({ ...f, ...patch } as Feature) : f;
}

/** 変数の名前を変えたとき、式の中の名前も変える */
export function renameInDoc(doc: CadDocument, from: string, to: string): CadDocument {
  const swap = (expr: string) => (namesIn(expr).includes(from) ? replaceName(expr, from, to) : expr);
  const variables = (doc.variables ?? []).map((v) => ({ ...v, name: v.name === from ? to : v.name, expr: swap(v.expr) }));
  const features = doc.features.map((f): Feature => {
    if (f.type === "sketch") {
      return { ...f, constraints: f.constraints.map((c) => (isDimension(c) && c.expr ? { ...c, expr: swap(c.expr) } : c)) };
    }
    if (!("exprs" in f) || !f.exprs) return f;
    const exprs: NumberExprs = {};
    for (const [k, e] of Object.entries(f.exprs)) if (e) exprs[k] = swap(e);
    return { ...f, exprs } as Feature;
  });
  return { ...doc, variables, features };
}

/** 変数を使っている場所の数(消すときの確認に使う) */
export function countUses(doc: CadDocument, name: string): number {
  const uses = (expr?: string) => (expr && namesIn(expr).includes(name) ? 1 : 0);
  let n = 0;
  for (const v of doc.variables ?? []) n += v.name === name ? 0 : uses(v.expr);
  for (const f of doc.features) {
    if (f.type === "sketch") for (const c of f.constraints) n += isDimension(c) ? uses(c.expr) : 0;
    else if ("exprs" in f && f.exprs) for (const e of Object.values(f.exprs)) n += uses(e);
  }
  return n;
}

/** 変数を消したとき、それを使っていた式を外す(数はそのまま残す) */
export function forgetName(doc: CadDocument, name: string): CadDocument {
  const keep = (expr?: string) => (expr && namesIn(expr).includes(name) ? undefined : expr);
  const features = doc.features.map((f): Feature => {
    if (f.type === "sketch") {
      return { ...f, constraints: f.constraints.map((c) => (isDimension(c) && c.expr && !keep(c.expr) ? { ...c, expr: undefined } : c)) };
    }
    if (!("exprs" in f) || !f.exprs) return f;
    const exprs: NumberExprs = {};
    for (const [k, e] of Object.entries(f.exprs)) if (keep(e)) exprs[k] = e;
    return { ...f, exprs } as Feature;
  });
  return { ...doc, features };
}

function replaceName(expr: string, from: string, to: string): string {
  // 名前の一部だけ一致したもの(「幅」と「幅2」)は変えない
  return expr.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(from)}(?![\\p{L}\\p{N}_])`, "gu"), to);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
