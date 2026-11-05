// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { TEMPLATES, type Template } from "../doc/templates";

interface Props {
  /** いまの作品に作業があるか(あれば、閉じてよいか注意を出す) */
  hasWork: boolean;
  onPick: (t: Template) => void;
  onClose: () => void;
}

/** 新しく始める画面。白紙か、課題のひな形をえらぶ */
export function NewDialog({ hasWork, onPick, onClose }: Props) {
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog new-dialog" role="dialog" aria-label="新しく始める">
        <h3>新しく始める</h3>
        {hasWork && <p className="panel-warning">いまの作品は閉じます。「もどす」ではもどせないので、残したいときは先に「ファイルに保存」してください。</p>}
        <div className="template-grid" data-testid="templates">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="template" onClick={() => onPick(t)} data-testid={`template-${t.id}`}>
              <span className="template-icon" aria-hidden>
                {t.icon}
              </span>
              <strong>{t.label}</strong>
              <small>{t.summary}</small>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}
