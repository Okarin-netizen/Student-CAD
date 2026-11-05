// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useState } from "react";
import type { ParamSpec } from "./params";

interface Props {
  spec: ParamSpec;
  value: number;
  onChange: (v: number) => void;
}

/**
 * 寸法の入力欄。指で押しやすい大きな −/+ ボタン付き。
 * 数字は入力中には反映せず、確定(Enter / 欄から離れる)したときに反映する。
 */
export function DimensionInput({ spec, value, onChange }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const v = Number(text.replace(/[^\d.\-]/g, ""));
    if (Number.isFinite(v) && text.trim() !== "") onChange(round(v));
    else setText(String(value));
  };
  const bump = (d: number) => onChange(round(value + d));
  const id = `dim-${spec.key}`;

  return (
    <div className="dim">
      <label htmlFor={id}>{spec.label}</label>
      <div className="dim-row">
        <button type="button" aria-label={`${spec.label}を減らす`} onClick={() => bump(-spec.step)}>
          −
        </button>
        <input
          id={id}
          data-testid={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="unit">mm</span>
        <button type="button" aria-label={`${spec.label}を増やす`} onClick={() => bump(spec.step)}>
          ＋
        </button>
      </div>
    </div>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;
