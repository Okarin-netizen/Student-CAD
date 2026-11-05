import { useEffect, useRef, useState } from "react";
import { evaluate } from "./expr";

interface Props {
  title: string;
  unit: string;
  initial: number;
  onSubmit: (v: number) => void;
  onCancel: () => void;
  /** 0 を許すか(角度など) */
  allowZero?: boolean;
}

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "⌫", "＋"];

/** 寸法を入れる大きな数字キーパッド。「25/2」のような計算式も入れられる */
export function NumberPad({ title, unit, initial, onSubmit, onCancel, allowZero }: Props) {
  const [text, setText] = useState(String(Math.round(initial * 100) / 100));
  const [fresh, setFresh] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = evaluate(text.replace(/−/g, "-").replace(/＋/g, "+"));
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
    if (valid) onSubmit(Math.round(value! * 1000) / 1000);
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
        {!valid && text.trim() !== "" && <p className="numpad-error">{allowZero ? "0 以上の数" : "0 より大きい数"}を入れてください</p>}
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
