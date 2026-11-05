// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import type { CadDocument, Feature, Id } from "../doc/types";
import type { FeatureStatus } from "../kernel/rebuild";
import { BASE_PLANE_LABELS } from "../doc/planes";
import { dependents } from "./store";
import { term } from "./terms";

interface Props {
  doc: CadDocument;
  statuses: FeatureStatus[];
  selected: Id | null;
  pro: boolean;
  disabled: boolean;
  onSelect: (id: Id | null) => void;
  onEdit: (id: Id) => void;
  onDelete: (id: Id) => void;
  /** 作り方の再生中なら、いま見せている作業の番号(1 から)。再生中でなければ null */
  replayStep: number | null;
  onReplay: () => void;
}

/** 作業のれきし(フィーチャーツリー)。上から順に実行される */
export function FeatureTree({ doc, statuses, selected, pro, disabled, onSelect, onEdit, onDelete, replayStep, onReplay }: Props) {
  const [confirm, setConfirm] = useState<Feature | null>(null);
  const status = new Map(statuses.map((s) => [s.id, s]));
  const nameOf = (id: Id) => doc.features.find((f) => f.id === id)?.name ?? "?";

  return (
    <aside className="tree" aria-label={term("history", pro)}>
      <div className="tree-head">
        <h2>{term("history", pro)}</h2>
        {doc.features.length > 1 && replayStep === null && (
          <button type="button" className="tree-replay" onClick={onReplay} disabled={disabled} title="作った順に、形ができていく様子を見る" data-testid="start-replay">
            ▶ 作り方を再生
          </button>
        )}
      </div>
      {doc.features.length === 0 && <p className="tree-empty">まだ何もありません。下の「{term("newSketch", pro)}」から始めましょう。</p>}
      <ol data-testid="feature-tree">
        {doc.features.map((f, i) => {
          const st = status.get(f.id);
          const bad = st && !st.ok;
          return (
            <li
              key={f.id}
              className={[
                selected === f.id ? "selected" : "",
                bad ? "bad" : "",
                replayStep !== null && i + 1 === replayStep ? "replay-current" : "",
                replayStep !== null && i + 1 > replayStep ? "replay-future" : "",
              ].join(" ")}
            >
              <button type="button" className="tree-item" disabled={disabled} onClick={() => onSelect(selected === f.id ? null : f.id)} onDoubleClick={() => onEdit(f.id)}>
                <span className="tree-num">{i + 1}</span>
                <span className="tree-icon" aria-hidden>
                  {icon(f)}
                </span>
                <span className="tree-name">
                  {f.name}
                  {f.type === "extrude" && <small> {nameOf(f.sketchId)} ・ {f.distance}mm</small>}
                  {f.type === "revolve" && <small> {nameOf(f.sketchId)} ・ {f.angle}°</small>}
                  {f.type === "fillet" && (
                    <small>
                      {" "}
                      {f.kind === "fillet" ? "R" : "C"}
                      {f.radius} ・ 辺 {f.edges.length} 本
                    </small>
                  )}
                  {f.type === "mirror" && <small> {f.source === "body" ? "立体ぜんぶ" : nameOf(f.source)} ・ {BASE_PLANE_LABELS[f.plane]}</small>}
                  {f.type === "loft" && <small> {f.sketchIds.map(nameOf).join(" → ")}</small>}
                  {f.type === "shell" && (
                    <small>
                      {" "}
                      あつさ {f.thickness}mm ・ 面 {f.faces.length} こ
                    </small>
                  )}
                  {f.type === "pattern" && (
                    <small>
                      {" "}
                      {nameOf(f.source)} ・ {f.kind === "linear" ? `${f.count}${f.count2 > 1 ? `×${f.count2}` : ""} こ` : `${f.count} こ / ${f.angle}°`}
                    </small>
                  )}
                </span>
                {bad && (
                  <span className="tree-error" role="img" aria-label="エラー">
                    ⚠️
                  </span>
                )}
              </button>
              {bad && <p className="tree-error-text">{(st as { error: string }).error}</p>}
              {st?.ok && st.warning && <p className="tree-warning-text">{st.warning}</p>}
              {selected === f.id && !disabled && (
                <div className="tree-actions">
                  <button type="button" onClick={() => onEdit(f.id)} data-testid="tree-edit">
                    なおす
                  </button>
                  <button type="button" className="danger" onClick={() => setConfirm(f)} data-testid="tree-delete">
                    けす
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {confirm && (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="dialog" role="dialog" aria-label="けす確認">
            <h3>「{confirm.name}」をけしますか?</h3>
            {dependents(doc, confirm.id).length > 0 && (
              <p>
                これを使っている {dependents(doc, confirm.id).map((f) => `「${f.name}」`).join("")} も一緒に消えます。
              </p>
            )}
            <p className="muted">まちがえたら「もどす」で元にもどせます。</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirm(null)}>
                やめる
              </button>
              <button
                type="button"
                className="danger"
                data-testid="confirm-delete"
                onClick={() => {
                  onDelete(confirm.id);
                  setConfirm(null);
                }}
              >
                けす
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function icon(f: Feature): string {
  switch (f.type) {
    case "sketch":
      return "✏️";
    case "fillet":
      return f.kind === "fillet" ? "◜" : "◸";
    case "mirror":
      return "🪞";
    case "pattern":
      return f.kind === "linear" ? "⋯" : "⟳";
    case "shell":
      return "🥛";
    case "loft":
      return f.operation === "cut" ? "🕳️" : "🔺";
    default:
      if (f.operation === "cut") return "🕳️";
      return f.type === "revolve" ? "🔄" : "🧊";
  }
}
