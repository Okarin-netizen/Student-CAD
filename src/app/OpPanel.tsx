import { useState } from "react";
import type { CadDocument, ExtrudeOperation, RevolveAxis, SketchFeature } from "../doc/types";
import { NumberPad } from "./NumberPad";
import type { OpFeature } from "./store";
import { term } from "./terms";

interface Props {
  doc: CadDocument;
  draft: OpFeature;
  pro: boolean;
  error?: string;
  busy: boolean;
  /** 角を丸めるとき、できあがりを見せているか */
  preview: boolean;
  onPreview: (on: boolean) => void;
  onChange: (patch: Partial<OpFeature>) => void;
  onOk: () => void;
  onCancel: () => void;
}

type Pad = { title: string; unit: string; initial: number; allowZero?: boolean; submit: (v: number) => void };

/** 押し出し・回転・角を丸めるの設定パネル。変えるとすぐ 3D に反映される */
export function OpPanel({ doc, draft, pro, error, busy, preview, onPreview, onChange, onOk, onCancel }: Props) {
  const [pad, setPad] = useState<Pad | null>(null);
  const idx = doc.features.findIndex((f) => f.id === draft.id);
  // 自分より前にあるスケッチだけ使える
  const sketches = doc.features.filter((f, i): f is SketchFeature => f.type === "sketch" && (idx < 0 || i < idx));
  // まだ立体がないときは「くっつける / けずる」は聞かない(けずるものがないので)
  const hasBodyBefore = doc.features.slice(0, idx < 0 ? undefined : idx).some((f) => f.type === "extrude" || f.type === "revolve");
  const title =
    draft.type === "extrude" ? term("extrude", pro) : draft.type === "revolve" ? term("revolve", pro) : term(draft.kind, pro);

  const sketchSelect = (sketchId: string) => (
    <label className="field">
      <span>使う{term("sketch", pro)}</span>
      <select value={sketchId} onChange={(e) => onChange({ sketchId: e.target.value })} data-testid="op-sketch">
        {sketches.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );

  const stepper = (label: string, value: number, unit: string, step: number, min: number, max: number, set: (v: number) => void, testid: string, allowZero = false) => (
    <div className="field">
      <span>{label}</span>
      <div className="stepper">
        <button type="button" aria-label={`${label}を小さく`} onClick={() => set(Math.max(min, Math.round((value - step) * 100) / 100))}>
          −
        </button>
        <button
          type="button"
          className="stepper-value"
          data-testid={testid}
          onClick={() => setPad({ title: `${label}を入れる`, unit, initial: value, allowZero, submit: (v) => set(Math.min(max, v)) })}
        >
          {value} {unit}
        </button>
        <button type="button" aria-label={`${label}を大きく`} onClick={() => set(Math.min(max, Math.round((value + step) * 100) / 100))}>
          ＋
        </button>
      </div>
    </div>
  );

  const operation = (op: ExtrudeOperation) => (!hasBodyBefore && op === "add" ? null : (
    <div className="field">
      <span>どうする?</span>
      <div className="segmented" role="radiogroup">
        {(["add", "cut"] as const).map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={op === o}
            className={op === o ? "active" : ""}
            data-testid={`op-${o}`}
            onClick={() => onChange({ operation: o })}
          >
            {o === "add" ? "🧊 " : "🕳️ "}
            {term(o, pro)}
          </button>
        ))}
      </div>
    </div>
  ));

  const flip = (label: string) => (
    <button type="button" className="wide" onClick={() => "flip" in draft && onChange({ flip: !draft.flip })} data-testid="op-flip">
      ⇅ {label}
    </button>
  );

  return (
    <div className="panel op-panel" role="dialog" aria-label={title}>
      <h3>{title}</h3>

      {draft.type === "extrude" && (
        <>
          {sketchSelect(draft.sketchId)}
          {stepper("あつさ", draft.distance, "mm", 1, 0.5, 10000, (v) => onChange({ distance: v }), "op-distance")}
          {operation(draft.operation)}
          {flip("向きを反対にする")}
        </>
      )}

      {draft.type === "revolve" && (
        <>
          {sketchSelect(draft.sketchId)}
          <AxisSelect sketch={sketches.find((s) => s.id === draft.sketchId)} axis={draft.axis} pro={pro} onChange={(axis) => onChange({ axis })} />
          {stepper("回す角度", draft.angle, "°", 15, 1, 360, (v) => onChange({ angle: v }), "op-angle")}
          {operation(draft.operation)}
          {draft.angle < 360 && flip("回す向きを反対にする")}
        </>
      )}

      {draft.type === "fillet" && (
        <>
          <div className="segmented" role="radiogroup">
            {(["fillet", "chamfer"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={draft.kind === k}
                className={draft.kind === k ? "active" : ""}
                data-testid={`op-${k}`}
                onClick={() => onChange({ kind: k })}
              >
                {k === "fillet" ? "◜ " : "◸ "}
                {term(k, pro)}
              </button>
            ))}
          </div>
          {stepper(draft.kind === "fillet" ? "丸める大きさ(半径)" : "落とす大きさ", draft.radius, "mm", 0.5, 0.1, 1000, (v) => onChange({ radius: v }), "op-radius")}
          <p className={draft.edges.length ? "op-edges" : "plane-hint"} data-testid="op-edges">
            {draft.edges.length === 0 ? "👆 3D の辺(線)をタップしてえらびます。もう一度タップするとはずせます" : `えらんだ辺: ${draft.edges.length} 本`}
          </p>
          {draft.edges.length > 0 && (
            <div className="op-row">
              <button type="button" onClick={() => onChange({ edges: [] })}>
                ぜんぶはずす
              </button>
              <button type="button" className={preview ? "active" : ""} aria-pressed={preview} onClick={() => onPreview(!preview)} data-testid="op-preview">
                {preview ? "辺をえらびなおす" : "できあがりを見る"}
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="panel-error" data-testid="op-error">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="primary" onClick={onOk} disabled={!!error || busy || (draft.type === "fillet" && draft.edges.length === 0)} data-testid="op-ok">
          OK
        </button>
      </div>

      {pad && (
        <NumberPad
          title={pad.title}
          unit={pad.unit}
          initial={pad.initial}
          allowZero={pad.allowZero}
          onSubmit={(v) => {
            pad.submit(v);
            setPad(null);
          }}
          onCancel={() => setPad(null)}
        />
      )}
    </div>
  );
}

function AxisSelect({ sketch, axis, pro, onChange }: { sketch?: SketchFeature; axis: RevolveAxis; pro: boolean; onChange: (a: RevolveAxis) => void }) {
  const lines = (sketch?.entities ?? []).filter((e) => e.type === "line");
  const value = axis.kind === "line" ? `line:${axis.line}` : axis.kind;
  // 補助線を先に並べる(軸にするための線なので)
  const sorted = [...lines].sort((a, b) => Number(!!b.construction) - Number(!!a.construction));
  return (
    <label className="field">
      <span>回す軸</span>
      <select
        value={value}
        data-testid="op-axis"
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "x" ? { kind: "x" } : v === "y" ? { kind: "y" } : { kind: "line", line: v.slice(5) });
        }}
      >
        <option value="y">たての軸(原点を通る緑の線)</option>
        <option value="x">横の軸(原点を通る赤の線)</option>
        {sorted.map((l) => (
          <option key={l.id} value={`line:${l.id}`}>
            {describeLine(sketch!, l, l.construction ? term("construction", pro) : "線")}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 「補助線(たて・20mm)」のように、どの線か分かる名前 */
function describeLine(sketch: SketchFeature, l: Extract<SketchFeature["entities"][number], { type: "line" }>, kind: string): string {
  const pos = new Map(sketch.entities.flatMap((e) => (e.type === "point" ? [[e.id, [e.x, e.y] as const]] : [])));
  const a = l.p1 === "origin" ? ([0, 0] as const) : pos.get(l.p1);
  const b = l.p2 === "origin" ? ([0, 0] as const) : pos.get(l.p2);
  if (!a || !b) return kind;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dir = Math.abs(dx) < 1e-6 ? "たて" : Math.abs(dy) < 1e-6 ? "よこ" : "ななめ";
  return `${kind}(${dir}・${Math.round(Math.hypot(dx, dy) * 10) / 10}mm)`;
}
