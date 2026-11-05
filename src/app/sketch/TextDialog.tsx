// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef, useState } from "react";

interface Props {
  /** 新しく置くときは「文字を入れる」、なおすときは「文字をなおす」 */
  title: string;
  initialText: string;
  initialSize: number;
  onSubmit: (text: string, size: number) => void;
  onCancel: () => void;
}

/** よく使う文字の大きさ(mm)。名札なら 8〜10mm くらいが 3Dプリンターでもきれいに出る */
const SIZES = [5, 8, 10, 15, 20, 30];

/** 文字と大きさを入れるダイアログ。名前を入れるので、ここは端末のキーボードを使う */
export function TextDialog({ title, initialText, initialSize, onSubmit, onCancel }: Props) {
  const [text, setText] = useState(initialText);
  const [size, setSize] = useState(initialSize);
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = text.trim() !== "" && size > 0;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => valid && onSubmit(text, size);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog text-dialog" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <label className="field">
          <span>文字</span>
          <input
            ref={inputRef}
            data-testid="text-input"
            value={text}
            placeholder="例: 技術 たろう"
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        <div className="field">
          <span>大きさ(1文字の高さ)</span>
          <div className="segmented wrap" role="radiogroup">
            {SIZES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} className={size === s ? "active" : ""} onClick={() => setSize(s)} data-testid={`text-size-${s}`}>
                {s} mm
              </button>
            ))}
          </div>
        </div>
        <p className="muted">3Dプリンターで出すときは、5mm より大きくすると字がつぶれにくくなります。</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={submit} data-testid="text-ok">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
