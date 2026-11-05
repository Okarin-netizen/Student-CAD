// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import type { Assignment, AssignmentCheck, WorldAxis } from "../doc/types";
import { AXIS_WORDS, USE_WORDS, type CheckResult } from "../doc/assignment";
import { newId } from "../doc/ids";
import { Icon } from "./Icon";

/** 生徒が見る課題のカード。説明と、条件ができたかどうか(自動で確かめる) */
export function AssignmentCard({ assignment, results }: { assignment: Assignment; results: CheckResult[] }) {
  const [open, setOpen] = useState(true);
  const done = results.filter((r) => r.ok).length;
  const all = results.length > 0 && done === results.length;
  return (
    <section className={`assignment-card ${open ? "open" : ""}`} aria-label="課題" data-testid="assignment-card">
      <button type="button" className="assignment-head" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="assignment-toggle">
        <span>
          <Icon name="assignment" /> {assignment.title}
        </span>
        {results.length > 0 && (
          <span className={`assignment-count ${all ? "ok" : ""}`} data-testid="assignment-count">
            {all ? <Icon name="check" /> : null}
            {done} / {results.length}
          </span>
        )}
        <span aria-hidden className={`assignment-chevron ${open ? "open" : ""}`}>
          <Icon name="chevron" />
        </span>
      </button>
      {open && (
        <div className="assignment-body">
          {assignment.instructions && <p className="assignment-text">{assignment.instructions}</p>}
          {results.length > 0 && (
            <ul className="assignment-checks" data-testid="assignment-checks">
              {results.map((r) => (
                <li key={r.id} className={r.ok ? "ok" : ""}>
                  <span className="mark" aria-label={r.ok ? "できた" : "まだ"}>
                    {r.ok ? "✓" : "・"}
                  </span>
                  <span>
                    {r.label}
                    <small>{r.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

interface EditorProps {
  initial: Assignment | undefined;
  onSave: (a: Assignment | undefined) => void;
  /** 課題ファイルとして書き出す(保存してから) */
  onExport: (a: Assignment) => void;
  onClose: () => void;
}

const USE_KEYS = Object.keys(USE_WORDS) as (keyof typeof USE_WORDS)[];

/**
 * 先生が課題を作る画面。いまの作品(作りかけの形)が、そのまま生徒の始まりの形になる。
 * 条件の数は空欄にすると「制限なし」。
 */
export function AssignmentEditor({ initial, onSave, onExport, onClose }: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [checks, setChecks] = useState<AssignmentCheck[]>(initial?.checks ?? []);

  const current = (): Assignment => ({ title: title.trim() || "課題", instructions: instructions.trim(), checks });
  const patch = (id: string, p: Partial<AssignmentCheck>) => setChecks((cs) => cs.map((c) => (c.id === id ? ({ ...c, ...p } as AssignmentCheck) : c)));
  type NewCheck = AssignmentCheck extends infer C ? (C extends AssignmentCheck ? Omit<C, "id"> : never) : never;
  const add = (c: NewCheck) => setChecks((cs) => [...cs, { ...c, id: newId("ck") } as AssignmentCheck]);
  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

  const range = (c: Extract<AssignmentCheck, { min?: number }>, unit: string) => (
    <>
      <input type="number" inputMode="decimal" aria-label="いくつ以上" value={c.min ?? ""} onChange={(e) => patch(c.id, { min: num(e.target.value) })} placeholder="下限なし" />
      〜
      <input type="number" inputMode="decimal" aria-label="いくつ以下" value={c.max ?? ""} onChange={(e) => patch(c.id, { max: num(e.target.value) })} placeholder="上限なし" />
      {unit}
    </>
  );

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog assignment-editor" role="dialog" aria-label="課題を作る">
        <h3>課題を作る(先生用)</h3>
        <p className="muted">いまの作品の形が、生徒が始めるときの形になります。白紙から始めさせたいときは、先に「新しく」で白紙にしてください。</p>
        <label className="field">
          課題の名前
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 名札を作ろう" data-testid="assignment-title" />
        </label>
        <label className="field">
          説明(生徒に見せる文)
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="作るもの・大きさ・使う作業など" data-testid="assignment-instructions" />
        </label>

        <h4>自動で確かめる条件</h4>
        {checks.length === 0 && <p className="tree-empty">条件はありません。下のボタンで追加できます。</p>}
        <ul className="check-editor" data-testid="assignment-check-list">
          {checks.map((c) => (
            <li key={c.id}>
              {c.kind === "size" && (
                <>
                  <select aria-label="どの向きの大きさ" value={c.axis} onChange={(e) => patch(c.id, { axis: e.target.value as WorldAxis })}>
                    {(Object.keys(AXIS_WORDS) as WorldAxis[]).map((a) => (
                      <option key={a} value={a}>
                        {AXIS_WORDS[a]}
                      </option>
                    ))}
                  </select>
                  {range(c, "mm")}
                </>
              )}
              {c.kind === "volume" && (
                <>
                  <span>体積</span>
                  {range(c, "cm³")}
                </>
              )}
              {c.kind === "uses" && (
                <>
                  <select aria-label="使う作業" value={c.feature} onChange={(e) => patch(c.id, { feature: e.target.value as typeof c.feature })}>
                    {USE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {USE_WORDS[k]}
                      </option>
                    ))}
                  </select>
                  <span>を使う</span>
                </>
              )}
              <button type="button" className="danger" aria-label="この条件をけす" onClick={() => setChecks((cs) => cs.filter((x) => x.id !== c.id))}>
                けす
              </button>
            </li>
          ))}
        </ul>
        <div className="check-add">
          <button type="button" onClick={() => add({ kind: "size", axis: "x" })} data-testid="add-size-check">
            ＋ 大きさ
          </button>
          <button type="button" onClick={() => add({ kind: "volume" })}>
            ＋ 体積
          </button>
          <button type="button" onClick={() => add({ kind: "uses", feature: "fillet" })} data-testid="add-uses-check">
            ＋ 使う作業
          </button>
        </div>

        <div className="dialog-actions">
          {initial && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onSave(undefined);
                onClose();
              }}
            >
              課題を外す
            </button>
          )}
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(current());
              onClose();
            }}
            data-testid="assignment-save"
          >
            決める
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const a = current();
              onSave(a);
              onExport(a);
              onClose();
            }}
            data-testid="assignment-export"
          >
            課題ファイルを配る形で保存
          </button>
        </div>
      </div>
    </div>
  );
}
