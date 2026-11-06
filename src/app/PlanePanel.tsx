// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import { BASE_PLANE_LABELS } from "../doc/planes";
import type { BasePlaneName } from "../doc/types";
import { Icon } from "./Icon";
import { NumberPad, type PadVariable } from "./NumberPad";

interface Props {
  /** 基準面をずらす量(mm)。0 ならそのままの基準面にかく */
  offset: number;
  onOffset: (mm: number) => void;
  /** 立体があるか(あれば「面をタップするとかける」と案内する) */
  hasBody: boolean;
  variables: PadVariable[];
  onPick: (name: BasePlaneName) => void;
  onCancel: () => void;
}

/** 「どこに絵をかきますか?」: スケッチをかく面をえらぶパネル */
export function PlanePanel({ offset, onOffset, hasBody, variables, onPick, onCancel }: Props) {
  const [pad, setPad] = useState(false);
  return (
    <div className="panel plane-panel" role="dialog" aria-label="かく面をえらぶ">
      <h3>どこに絵をかきますか?</h3>
      <div className="plane-buttons">
        {(Object.keys(BASE_PLANE_LABELS) as BasePlaneName[]).map((n) => (
          <button key={n} type="button" data-testid={`plane-${n}`} onClick={() => onPick(n)}>
            {BASE_PLANE_LABELS[n]}
            {offset > 0 && <small> から {offset}mm</small>}
          </button>
        ))}
      </div>
      <div className="field plane-offset">
        <span>面をずらす(高さのちがう形をかいて「つなぐ」ときに使います)</span>
        <div className="stepper">
          <button type="button" aria-label="ずらす量を小さく" onClick={() => onOffset(Math.max(0, offset - 5))}>
            −
          </button>
          <button type="button" className="stepper-value" onClick={() => setPad(true)} data-testid="plane-offset">
            {offset} mm
          </button>
          <button type="button" aria-label="ずらす量を大きく" onClick={() => onOffset(offset + 5)}>
            ＋
          </button>
        </div>
      </div>
      {pad && (
        <NumberPad
          title="面をずらす量を入れる"
          unit="mm"
          initial={offset}
          allowZero
          variables={variables}
          onSubmit={(v) => {
            onOffset(v);
            setPad(false);
          }}
          onCancel={() => setPad(false)}
        />
      )}
      {hasBody && (
        <p className="plane-hint" data-testid="face-hint">
          <Icon name="tap" /> 立体の平らな面をタップすると、その面にかけます(指した面がオレンジになります)
        </p>
      )}
      <button type="button" onClick={onCancel}>
        やめる
      </button>
    </div>
  );
}
