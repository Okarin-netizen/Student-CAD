// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef, useState } from "react";
import { evaluate, namesIn } from "../doc/expr";

/** 数字キーパッドで使える変数 */
export interface PadVariable {
  name: string;
  value: number;
}

interface Props {
  title: string;
  unit: string;
  initial: number;
  /** 最初に出す式(変数を使っている寸法をなおすとき) */
  initialExpr?: string;
  /** expr は変数を使った式のときだけ入る(例: "幅/2") */
  onSubmit: (v: number, expr?: string) => void;
  onCancel: () => void;
  /** 0 を許すか(角度など) */
  allowZero?: boolean;
  /** 変数(あれば、名前のボタンを出す) */
  variables?: PadVariable[];
}

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "⌫", "＋"];

/** 寸法を入れる大きな数字キーパッド。「25/2」のような計算式や、変数の名前も入れられる */
export function NumberPad({ title, unit, initial, initialExpr, onSubmit, onCancel, allowZero, variables = [] }: Props) {
  const [text, setText] = useState(initialExpr ?? String(Math.round(initial * 100) / 100));
  const [fresh, setFresh] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const vars = Object.fromEntries(variables.map((v) => [v.name, v.value]));
  const normalized = text.replace(/−/g, "-").replace(/＋/g, "+").trim();
  const value = evaluate(normalized, vars);
  const usesVariable = namesIn(normalized).length > 0;
  const valid = value != null && (allowZero ? value >= 0 : value > 0);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const press = (k: string) => {
    if (k === "⌫") {
      setText((t) => (fresh ? "" : t.slice(0, -1)));
    } else {
      setText((t) => (fresh && /[0-9.]/.test(k) ? k : t + k));
    }
    setFresh(false);
  };
  const submit = () => {
    if (valid) onSubmit(Math.round(value! * 1000) / 1000, usesVariable ? normalized : undefined);
  };
  /** 変数の名前は、いまの式の後ろに足す(はじめての入力なら置きかえる) */
  const insertName = (name: string) => {
    setText((t) => (fresh ? name : t + name));
    setFresh(false);
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog numpad" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div className="numpad-display">
          <input
            ref={inputRef}
            data-testid="numpad-input"
            value={text}
            inputMode="decimal"
            onChange={(e) => {
              setText(e.target.value);
              setFresh(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
          <span>{unit}</span>
        </div>
        {usesVariable && valid && (
          <p className="numpad-result" data-testid="numpad-result">
            = {Math.round(value! * 100) / 100} {unit}(変数を変えると、ここも変わります)
          </p>
        )}
        {!valid && text.trim() !== "" && (
          <p className="numpad-error">
            {value == null && usesVariable ? "知らない名前があるか、式が計算できません" : `${allowZero ? "0 以上の数" : "0 より大きい数"}を入れてください`}
          </p>
        )}
        {variables.length > 0 && (
          <div className="numpad-vars" aria-label="変数">
            {variables.map((v) => (
              <button key={v.name} type="button" onClick={() => insertName(v.name)} data-testid={`numpad-var-${v.name}`}>
                {v.name}
                <small>{Math.round(v.value * 100) / 100}</small>
              </button>
            ))}
          </div>
        )}
        <div className="numpad-keys">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k === "÷" ? "/" : k === "×" ? "*" : k === "−" ? "-" : k === "＋" ? "+" : k)}>
              {k}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="primary" data-testid="numpad-ok" disabled={!valid} onClick={submit}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
