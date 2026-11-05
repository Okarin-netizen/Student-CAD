// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import { nextName } from "../doc/ids";
import { isValidName } from "../doc/expr";
import type { CadDocument, Variable } from "../doc/types";
import { countUses, evaluateVariables } from "../doc/variables";
import { NumberPad } from "./NumberPad";
import { addVariable, deleteVariable, updateVariable } from "./store";
import { term } from "./terms";

interface Props {
  doc: CadDocument;
  pro: boolean;
  onClose: () => void;
}

/**
 * 変数(名前のついた数)の一覧。ここで数を変えると、それを使っている寸法やあつさが全部変わる。
 * 例:「幅」を 40 → 60 にすると、幅を使った長方形も穴の位置も一緒に変わる。
 */
export function VariablesPanel({ doc, pro, onClose }: Props) {
  const variables = doc.variables ?? [];
  const { values, errors } = evaluateVariables(variables);
  const [editing, setEditing] = useState<Variable | null>(null);
  const [confirm, setConfirm] = useState<Variable | null>(null);
  const [nameError, setNameError] = useState<{ id: string; text: string } | null>(null);

  const rename = (v: Variable, name: string) => {
    const trimmed = name.trim();
    if (trimmed === v.name) return setNameError(null);
    if (!isValidName(trimmed)) return setNameError({ id: v.id, text: "名前は文字で始め、記号やすき間は使わないでください" });
    if (variables.some((o) => o.id !== v.id && o.name === trimmed)) return setNameError({ id: v.id, text: "同じ名前がもうあります" });
    setNameError(null);
    updateVariable(v.id, { name: trimmed });
  };

  const add = () => {
    addVariable(
      nextName("数", variables.map((v) => v.name)),
      "10",
    );
  };

  // 式で使えるのは、その変数より上にある変数だけ
  const usableFor = (v: Variable | null) => {
    const i = v ? variables.findIndex((x) => x.id === v.id) : variables.length;
    return variables.slice(0, i).filter((x) => x.name in values).map((x) => ({ name: x.name, value: values[x.name] }));
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog variables-panel" role="dialog" aria-label={term("variables", pro)}>
        <h3>📏 {term("variables", pro)}</h3>
        <p className="muted">
          数に名前をつけて、寸法やあつさに使えます。ここで数を変えると、その名前を使っているところが全部いっしょに変わります。
          寸法を入れる数字キーパッドで、名前のボタンを押すと使えます。
        </p>

        {variables.length === 0 && <p className="tree-empty">まだありません。下の「＋ 追加」で作りましょう。(例: 名前「幅」、数「40」)</p>}

        <ul className="var-list" data-testid="variables">
          {variables.map((v) => (
            <li key={v.id}>
              <input
                key={v.name}
                className="var-name"
                aria-label="名前"
                defaultValue={v.name}
                data-testid={`var-name-${v.name}`}
                onBlur={(e) => rename(v, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
              />
              <span aria-hidden>=</span>
              <button type="button" className="var-value" onClick={() => setEditing(v)} data-testid={`var-value-${v.name}`}>
                {v.expr}
                {v.name in values && v.expr.trim() !== String(values[v.name]) && <small> = {round(values[v.name])}</small>}
              </button>
              <button type="button" className="danger" aria-label={`${v.name}をけす`} onClick={() => setConfirm(v)}>
                けす
              </button>
              {errors[v.id] && <p className="panel-error">{errors[v.id]}</p>}
              {nameError?.id === v.id && <p className="panel-error">{nameError.text}</p>}
            </li>
          ))}
        </ul>

        <div className="dialog-actions">
          <button type="button" onClick={add} data-testid="var-add">
            ＋ 追加
          </button>
          <button type="button" className="primary" onClick={onClose} data-testid="var-close">
            とじる
          </button>
        </div>

        {editing && (
          <NumberPad
            title={`「${editing.name}」の数`}
            unit=""
            initial={values[editing.name] ?? 0}
            initialExpr={editing.expr}
            allowZero
            variables={usableFor(editing)}
            onSubmit={(value, expr) => {
              updateVariable(editing.id, { expr: expr ?? String(value) });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}

        {confirm && (
          <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
            <div className="dialog" role="dialog" aria-label="変数をけす確認">
              <h3>「{confirm.name}」をけしますか?</h3>
              {countUses(doc, confirm.name) > 0 && <p>これを使っているところが {countUses(doc, confirm.name)} こあります。けしても、いまの数のまま残ります。</p>}
              <div className="dialog-actions">
                <button type="button" onClick={() => setConfirm(null)}>
                  やめる
                </button>
                <button
                  type="button"
                  className="danger"
                  data-testid="var-delete-ok"
                  onClick={() => {
                    deleteVariable(confirm.id);
                    setConfirm(null);
                  }}
                >
                  けす
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;
