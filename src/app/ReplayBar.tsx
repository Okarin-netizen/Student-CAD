// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useState } from "react";
import type { Feature } from "../doc/types";
import { Icon } from "./Icon";
import { featureLabel } from "./terms";

interface Props {
  features: Feature[];
  /** いま見せている作業の番号(1 から) */
  step: number;
  /** 形の計算中は、次へ進まない(計算が追いつかないと形が飛ぶため) */
  busy: boolean;
  onStep: (step: number) => void;
  /** 専門用語で表示するか(作業の名前の言葉を切りかえる) */
  pro: boolean;
  onClose: () => void;
}

/** 1つの作業を見せる時間(ミリ秒) */
const INTERVAL = 1200;

/** 作り方の再生。れきしを最初から1つずつ、形ができていく様子を見せる */
export function ReplayBar({ features, step, busy, pro, onStep, onClose }: Props) {
  const [playing, setPlaying] = useState(true);
  const n = features.length;
  const atEnd = step >= n;

  useEffect(() => {
    if (!playing || busy) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onStep(step + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [playing, busy, step, atEnd, onStep]);

  const f = features[step - 1];
  return (
    <nav className="replaybar" aria-label="作り方の再生" data-testid="replaybar">
      <div className="replay-buttons">
        <button type="button" onClick={() => onStep(1)} aria-label="最初へ" disabled={step <= 1}>
          <Icon name="first" />
        </button>
        <button type="button" onClick={() => onStep(step - 1)} aria-label="1つもどる" disabled={step <= 1} data-testid="replay-prev">
          <Icon name="prev" />
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (atEnd) onStep(1);
            setPlaying((p) => !p || atEnd);
          }}
          data-testid="replay-play"
        >
          {playing && !atEnd ? <><Icon name="pause" /> 止める</> : atEnd ? <><Icon name="replay" /> もう一度</> : <><Icon name="play" /> 再生</>}
        </button>
        <button type="button" onClick={() => onStep(step + 1)} aria-label="1つ進む" disabled={atEnd} data-testid="replay-next">
          <Icon name="next" />
        </button>
        <button type="button" onClick={() => onStep(n)} aria-label="最後へ" disabled={atEnd}>
          <Icon name="last" />
        </button>
      </div>
      <input
        type="range"
        className="replay-slider"
        min={1}
        max={n}
        value={step}
        aria-label="何番目の作業まで見せるか"
        onChange={(e) => {
          setPlaying(false);
          onStep(Number(e.target.value));
        }}
      />
      <span className="replay-label" data-testid="replay-label">
        {step} / {n} ・ {f ? featureLabel(f.name, pro) : ""}
      </span>
      <button type="button" onClick={onClose} data-testid="replay-close">
        おわる
      </button>
    </nav>
  );
}
