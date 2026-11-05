import { useState } from "react";
import type { CadDocument, ExtrudeFeature, SketchFeature } from "../doc/types";
import { NumberPad } from "./NumberPad";
import { term } from "./terms";

interface Props {
  doc: CadDocument;
  draft: ExtrudeFeature;
  pro: boolean;
  error?: string;
  busy: boolean;
  onChange: (patch: Partial<ExtrudeFeature>) => void;
  onOk: () => void;
  onCancel: () => void;
}

/** 押し出しの設定パネル。変えるとすぐ 3D に反映される */
export function ExtrudePanel({ doc, draft, pro, error, busy, onChange, onOk, onCancel }: Props) {
  const [pad, setPad] = useState(false);
  const idx = doc.features.findIndex((f) => f.id === draft.id);
  // 自分より前にあるスケッチだけ使える
  const sketches = doc.features.filter((f, i): f is SketchFeature => f.type === "sketch" && (idx < 0 || i < idx));
  const step = (d: number) => onChange({ distance: Math.max(0.5, Math.round((draft.distance + d) * 100) / 100) });

  return (
    <div className="panel extrude-panel" role="dialog" aria-label={term("extrude", pro)}>
      <h3>{term("extrude", pro)}</h3>

      <label className="field">
        <span>使う{term("sketch", pro)}</span>
        <select value={draft.sketchId} onChange={(e) => onChange({ sketchId: e.target.value })} data-testid="extrude-sketch">
          {sketches.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>あつさ</span>
        <div className="stepper">
          <button type="button" aria-label="1mm うすく" onClick={() => step(-1)}>
            −
          </button>
          <button type="button" className="stepper-value" data-testid="extrude-distance" onClick={() => setPad(true)}>
            {draft.distance} mm
          </button>
          <button type="button" aria-label="1mm あつく" onClick={() => step(1)}>
            ＋
          </button>
        </div>
      </div>

      <div className="field">
        <span>どうする?</span>
        <div className="segmented" role="radiogroup">
          {(["add", "cut"] as const).map((op) => (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={draft.operation === op}
              className={draft.operation === op ? "active" : ""}
              data-testid={`extrude-${op}`}
              onClick={() => onChange({ operation: op })}
            >
              {op === "add" ? "🧊 " : "🕳️ "}
              {term(op, pro)}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="wide" onClick={() => onChange({ flip: !draft.flip })} data-testid="extrude-flip">
        ⇅ 向きを反対にする
      </button>

      {error && (
        <p className="panel-error" data-testid="extrude-error">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="primary" onClick={onOk} disabled={!!error || busy} data-testid="extrude-ok">
          OK
        </button>
      </div>

      {pad && (
        <NumberPad
          title="あつさを入れる"
          unit="mm"
          initial={draft.distance}
          onSubmit={(v) => {
            onChange({ distance: v });
            setPad(false);
          }}
          onCancel={() => setPad(false)}
        />
      )}
    </div>
  );
}
