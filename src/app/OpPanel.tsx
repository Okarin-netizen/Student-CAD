// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState, type ReactNode } from "react";
import type {
  BasePlaneName,
  CadDocument,
  ExtrudeOperation,
  MirrorFeature,
  PatternFeature,
  RevolveAxis,
  SketchFeature,
  WorldAxis,
} from "../doc/types";
import { NumberPad, type PadVariable } from "./NumberPad";
import { isCopyable, type OpFeature } from "./store";
import { featureLabel, term, withFeatureLabels } from "./terms";
import { planeLabel } from "../doc/planes";

interface Props {
  doc: CadDocument;
  draft: OpFeature;
  pro: boolean;
  error?: string;
  /** できたが知らせたいこと */
  warning?: string;
  busy: boolean;
  /** 角を丸めるとき、できあがりを見せているか */
  preview: boolean;
  /** 数の欄に使える変数 */
  variables: PadVariable[];
  onPreview: (on: boolean) => void;
  onChange: (patch: Partial<OpFeature>) => void;
  onOk: () => void;
  onCancel: () => void;
}

/** 数の欄の設定。field は作業の中の数の名前(distance など)で、変数の式もこの名前で覚える */
interface StepperSpec {
  label: string;
  field: string;
  unit: string;
  step: number;
  min: number;
  max: number;
  testid: string;
  /** 整数だけ(数など) */
  integer?: boolean;
}

type Pad = { spec: StepperSpec; value: number; expr?: string };

const AXIS_LABELS: Record<WorldAxis, string> = {
  x: "横(X・赤の向き)",
  y: "奥行き(Y・緑の向き)",
  z: "高さ(Z・青の向き)",
};

const MIRROR_PLANES: { plane: BasePlaneName; label: string }[] = [
  { plane: "right", label: "左右に写す(右の面が鏡)" },
  { plane: "front", label: "前後に写す(正面が鏡)" },
  { plane: "top", label: "上下に写す(上の面が鏡)" },
];

/** 押し出し・回転・角を丸める・対称・ならべるの設定パネル。変えるとすぐ 3D に反映される */
export function OpPanel({ doc, draft, pro, error, warning, busy, preview, variables, onPreview, onChange, onOk, onCancel }: Props) {
  const [pad, setPad] = useState<Pad | null>(null);
  const idx = doc.features.findIndex((f) => f.id === draft.id);
  const before = doc.features.slice(0, idx < 0 ? undefined : idx);
  // 自分より前にあるスケッチと、形を作った作業だけ使える
  const sketches = before.filter((f): f is SketchFeature => f.type === "sketch");
  const copyable = before.filter(isCopyable);
  // まだ立体がないときは「くっつける / けずる」は聞かない(けずるものがないので)
  const hasBodyBefore = before.some((f) => f.type === "extrude" || f.type === "revolve" || f.type === "loft" || f.type === "sweep");
  const title = panelTitle(draft, pro);

  /** 数を変える。変数の式は、式で入れたときだけ残す(−・＋ボタンで変えたら外す) */
  const setNumber = (field: string, value: number, expr?: string) => {
    const exprs = { ...(draft.exprs ?? {}) };
    if (expr) exprs[field] = expr;
    else delete exprs[field];
    onChange({ [field]: value, exprs } as Partial<OpFeature>);
  };

  const stepper = (spec: StepperSpec): ReactNode => {
    const value = (draft as unknown as Record<string, number>)[spec.field];
    const expr = draft.exprs?.[spec.field];
    const clamp = (v: number) => Math.min(spec.max, Math.max(spec.min, spec.integer ? Math.round(v) : Math.round(v * 100) / 100));
    return (
      <div className="field">
        <span>{spec.label}</span>
        <div className="stepper">
          <button type="button" aria-label={`${spec.label}を小さく`} onClick={() => setNumber(spec.field, clamp(value - spec.step))}>
            −
          </button>
          <button type="button" className="stepper-value" data-testid={spec.testid} onClick={() => setPad({ spec, value, expr })}>
            {expr ? `${expr} = ` : ""}
            {value} {spec.unit}
          </button>
          <button type="button" aria-label={`${spec.label}を大きく`} onClick={() => setNumber(spec.field, clamp(value + spec.step))}>
            ＋
          </button>
        </div>
      </div>
    );
  };

  const sketchSelect = (sketchId: string) => (
    <label className="field">
      <span>使う{term("sketch", pro)}</span>
      <select value={sketchId} onChange={(e) => onChange({ sketchId: e.target.value })} data-testid="op-sketch">
        {sketches.map((s) => (
          <option key={s.id} value={s.id}>
            {featureLabel(s.name, pro)}
          </option>
        ))}
      </select>
    </label>
  );

  const operation = (op: ExtrudeOperation) =>
    !hasBodyBefore && op === "add" ? null : (
      <Segmented
        label="どうする?"
        value={op}
        options={(["add", "cut"] as const).map((o) => ({ value: o, label: term(o, pro), testid: `op-${o}` }))}
        onChange={(o) => onChange({ operation: o })}
      />
    );

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
          {stepper({ label: "あつさ", field: "distance", unit: "mm", step: 1, min: 0.5, max: 10000, testid: "op-distance" })}
          {operation(draft.operation)}
          {flip("向きを反対にする")}
        </>
      )}

      {draft.type === "revolve" && (
        <>
          {sketchSelect(draft.sketchId)}
          <AxisSelect sketch={sketches.find((s) => s.id === draft.sketchId)} axis={draft.axis} pro={pro} onChange={(axis) => onChange({ axis })} />
          {stepper({ label: "回す角度", field: "angle", unit: "°", step: 15, min: 1, max: 360, testid: "op-angle" })}
          {operation(draft.operation)}
          {draft.angle < 360 && flip("回す向きを反対にする")}
        </>
      )}

      {draft.type === "fillet" && (
        <>
          <Segmented
            value={draft.kind}
            options={(["fillet", "chamfer"] as const).map((k) => ({ value: k, label: `${k === "fillet" ? "◜" : "◸"} ${term(k, pro)}`, testid: `op-${k}` }))}
            onChange={(k) => onChange({ kind: k })}
          />
          {stepper({ label: draft.kind === "fillet" ? "丸める大きさ(半径)" : "落とす大きさ", field: "radius", unit: "mm", step: 0.5, min: 0.1, max: 1000, testid: "op-radius" })}
          <p className={draft.edges.length ? "op-edges" : "plane-hint"} data-testid="op-edges">
            {draft.edges.length === 0 ? "3D の辺(線)をタップしてえらびます。もう一度タップするとはずせます" : `えらんだ辺: ${draft.edges.length} 本`}
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

      {draft.type === "loft" && (
        <>
          <LoftSketches sketches={sketches} pro={pro} value={draft.sketchIds} onChange={(sketchIds) => onChange({ sketchIds })} />
          <label className="check">
            <input type="checkbox" checked={draft.ruled} onChange={(e) => onChange({ ruled: e.target.checked })} data-testid="op-ruled" />
            まっすぐつなぐ(角ばった形にする)
          </label>
          {operation(draft.operation)}
        </>
      )}

      {draft.type === "sweep" && (
        <>
          <label className="field">
            <span>道すじ(閉じていない線のスケッチ)</span>
            <select value={draft.pathId} onChange={(e) => onChange({ pathId: e.target.value })} data-testid="op-path">
              {sketches.map((s) => (
                <option key={s.id} value={s.id}>
                  {featureLabel(s.name, pro)}({planeLabel(s.plane)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>断面(動かす形のスケッチ)</span>
            <select value={draft.profileId} onChange={(e) => onChange({ profileId: e.target.value })} data-testid="op-profile">
              {sketches.map((s) => (
                <option key={s.id} value={s.id}>
                  {featureLabel(s.name, pro)}({planeLabel(s.plane)})
                </option>
              ))}
            </select>
          </label>
          <p className="plane-hint">断面は、スケッチの原点(赤い点)のまわりにかきます。道すじのはじめの点に、道すじと直角になるように置きます</p>
          {operation(draft.operation)}
        </>
      )}

      {draft.type === "shell" && (
        <>
          {stepper({ label: "のこすあつさ", field: "thickness", unit: "mm", step: 0.5, min: 0.2, max: 1000, testid: "op-thickness" })}
          <p className={draft.faces.length ? "op-edges" : "plane-hint"} data-testid="op-faces">
            {draft.faces.length === 0 ? "取りのぞく面(ペン立てなら上の面)を 3D でタップしてえらびます" : `取りのぞく面: ${draft.faces.length} こ`}
          </p>
          {draft.faces.length > 0 && (
            <div className="op-row">
              <button type="button" onClick={() => onChange({ faces: [] })}>
                ぜんぶはずす
              </button>
              <button type="button" className={preview ? "active" : ""} aria-pressed={preview} onClick={() => onPreview(!preview)} data-testid="op-preview">
                {preview ? "面をえらびなおす" : "できあがりを見る"}
              </button>
            </div>
          )}
        </>
      )}

      {draft.type === "mirror" && <MirrorFields draft={draft} pro={pro} copyable={copyable} onChange={onChange} />}

      {draft.type === "pattern" && (
        <>
          <SourceSelect label="ならべるもの" pro={pro} value={draft.source} options={copyable} onChange={(source) => onChange({ source })} />
          <Segmented
            label="ならべ方"
            value={draft.kind}
            options={(["linear", "circular"] as const).map((k) => ({ value: k, label: `${k === "linear" ? "⋯" : "⟳"} ${term(k, pro)}`, testid: `op-${k}` }))}
            onChange={(kind) => onChange({ kind })}
          />
          <AxisPick label={draft.kind === "linear" ? "ならべる向き" : "回す軸(原点を通る)"} value={draft.axis} onChange={(axis) => onChange({ axis })} testid="op-axis" />
          {stepper({ label: "いくつにする?(元のものもふくむ)", field: "count", unit: "こ", step: 1, min: 2, max: 100, testid: "op-count", integer: true })}
          {draft.kind === "linear" ? (
            <>
              {stepper({ label: "となりとの間かく", field: "spacing", unit: "mm", step: 1, min: 0.5, max: 10000, testid: "op-spacing" })}
              {flip("向きを反対にする")}
              <LinearSecond draft={draft} onChange={onChange} stepper={stepper} />
            </>
          ) : (
            stepper({ label: "全体の角度(360° なら一周に同じ間かく)", field: "angle", unit: "°", step: 15, min: 1, max: 360, testid: "op-angle" })
          )}
        </>
      )}

      {error && (
        <p className="panel-error" data-testid="op-error">
          {withFeatureLabels(error, doc.features.map((f) => f.name), pro)}
        </p>
      )}
      {!error && warning && (
        <p className="panel-warning" data-testid="op-warning">
          {withFeatureLabels(warning, doc.features.map((f) => f.name), pro)}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="primary" onClick={onOk} disabled={!!error || busy || (draft.type === "fillet" && draft.edges.length === 0) || (draft.type === "shell" && draft.faces.length === 0)} data-testid="op-ok">
          OK
        </button>
      </div>

      {pad && (
        <NumberPad
          title={`${pad.spec.label}を入れる`}
          unit={pad.spec.unit}
          initial={pad.value}
          initialExpr={pad.expr}
          variables={variables}
          onSubmit={(v, expr) => {
            const value = Math.min(pad.spec.max, pad.spec.integer ? Math.round(v) : v);
            setNumber(pad.spec.field, value, expr);
            setPad(null);
          }}
          onCancel={() => setPad(null)}
        />
      )}
    </div>
  );
}

function panelTitle(draft: OpFeature, pro: boolean): string {
  switch (draft.type) {
    case "extrude":
      return term("extrude", pro);
    case "revolve":
      return term("revolve", pro);
    case "fillet":
      return term(draft.kind, pro);
    case "mirror":
      return term("mirror", pro);
    case "pattern":
      return term("pattern", pro);
    case "loft":
      return term("loft", pro);
    case "shell":
      return term("shell", pro);
    case "sweep":
      return term("sweep", pro);
  }
}

/**
 * つなぐスケッチをえらぶ。タップした順が、つなぐ順になる(番号を出す)。
 * もう一度タップすると外す。
 */
function LoftSketches({ sketches, value, pro, onChange }: { sketches: SketchFeature[]; value: string[]; pro: boolean; onChange: (ids: string[]) => void }) {
  return (
    <div className="field">
      <span>つなぐスケッチ(タップした順につなぎます)</span>
      <div className="loft-list" data-testid="op-loft-sketches">
        {sketches.map((s) => {
          const n = value.indexOf(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={n >= 0 ? "active" : ""}
              aria-pressed={n >= 0}
              onClick={() => onChange(n >= 0 ? value.filter((id) => id !== s.id) : [...value, s.id])}
            >
              <span className="loft-num">{n >= 0 ? n + 1 : ""}</span>
              {featureLabel(s.name, pro)}
              <small>{planeLabel(s.plane)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- 小さな部品 ----

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: { value: T; label: string; testid?: string }[];
  onChange: (v: T) => void;
}

/** ボタンをならべて1つをえらぶ */
function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const buttons = (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "active" : ""} data-testid={o.testid} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!label) return buttons;
  return (
    <div className="field">
      <span>{label}</span>
      {buttons}
    </div>
  );
}

interface SourceSelectProps {
  label: string;
  value: string;
  options: CadDocument["features"];
  onChange: (v: string) => void;
  /** 「立体ぜんぶ」をえらべるようにする(対称のとき) */
  includeBody?: boolean;
  /** 専門用語で表示するか(作業の名前の言葉を切りかえる) */
  pro: boolean;
}

function SourceSelect({ label, value, options, onChange, includeBody, pro }: SourceSelectProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid="op-source">
        {includeBody && <option value="body">立体ぜんぶ</option>}
        {options.map((f) => (
          <option key={f.id} value={f.id}>
            {featureLabel(f.name, pro)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AxisPick({ label, value, onChange, testid }: { label: string; value: WorldAxis; onChange: (a: WorldAxis) => void; testid: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as WorldAxis)} data-testid={testid}>
        {(Object.keys(AXIS_LABELS) as WorldAxis[]).map((a) => (
          <option key={a} value={a}>
            {AXIS_LABELS[a]}
          </option>
        ))}
      </select>
    </label>
  );
}

function MirrorFields({ draft, copyable, pro, onChange }: { draft: MirrorFeature; copyable: CadDocument["features"]; pro: boolean; onChange: (p: Partial<MirrorFeature>) => void }) {
  return (
    <>
      <SourceSelect label="何を写す?" pro={pro} value={draft.source} options={copyable} includeBody onChange={(source) => onChange({ source })} />
      <div className="field">
        <span>鏡にする面(原点を通る)</span>
        <div className="segmented vertical" role="radiogroup">
          {MIRROR_PLANES.map((m) => (
            <button
              key={m.plane}
              type="button"
              role="radio"
              aria-checked={draft.plane === m.plane}
              className={draft.plane === m.plane ? "active" : ""}
              data-testid={`op-plane-${m.plane}`}
              onClick={() => onChange({ plane: m.plane })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="plane-hint">形の真ん中を原点にしてかいておくと、きれいに対称になります</p>
    </>
  );
}

interface LinearSecondProps {
  draft: PatternFeature;
  onChange: (p: Partial<PatternFeature>) => void;
  stepper: (s: StepperSpec) => ReactNode;
}

/** まっすぐならべるときの、2つ目の向き(格子のようにならべる) */
function LinearSecond({ draft, onChange, stepper }: LinearSecondProps) {
  const on = draft.count2 > 1;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ count2: e.target.checked ? 2 : 1, axis2: draft.axis2 === draft.axis ? nextAxis(draft.axis) : draft.axis2 })}
          data-testid="op-second"
        />
        もう1つの向きにもならべる(格子のように)
      </label>
      {on && (
        <>
          <AxisPick label="2つ目の向き" value={draft.axis2} onChange={(axis2) => onChange({ axis2 })} testid="op-axis2" />
          {stepper({ label: "2つ目の向きの数", field: "count2", unit: "こ", step: 1, min: 1, max: 100, testid: "op-count2", integer: true })}
          {stepper({ label: "2つ目の向きの間かく", field: "spacing2", unit: "mm", step: 1, min: 0.5, max: 10000, testid: "op-spacing2" })}
        </>
      )}
    </>
  );
}

const nextAxis = (a: WorldAxis): WorldAxis => (a === "x" ? "y" : a === "y" ? "z" : "x");

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
