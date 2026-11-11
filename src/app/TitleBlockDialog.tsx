// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 図面の表題欄に入れる「学籍番号・氏名・材料」を入れる画面。2026-11-10 追加。
// 今までは図面の上に入力らんが3つならび、紙が小さくなっていたので、表題欄をタップして入れるようにした。

import type { Author } from "../doc/types";
import { digitsOnly, isStudentId } from "./author";

interface Props {
  who: Author;
  material: string;
  onAuthor: (a: Author) => void;
  onMaterial: (m: string) => void;
  onClose: () => void;
}

export function TitleBlockDialog({ who, material, onAuthor, onMaterial, onClose }: Props) {
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog title-block-dialog" role="dialog" aria-label="表題欄に入れること">
        <h3>表題欄に入れること</h3>
        <p className="muted">図面の右下(表題欄)と、保存するファイルの名前に入ります。</p>
        <label className={`field title-field ${isStudentId(who.studentId) ? "" : "needs"}`}>
          <span>学籍番号(4けた)</span>
          <input
            value={who.studentId}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => onAuthor({ ...who, studentId: digitsOnly(e.target.value) })}
            placeholder="例: 2312"
            data-testid="drawing-student-id"
            autoFocus
          />
        </label>
        <label className={`field title-field ${who.name.trim() ? "" : "needs"}`}>
          <span>氏名</span>
          <input value={who.name} onChange={(e) => onAuthor({ ...who, name: e.target.value })} placeholder="作った人の名前" data-testid="drawing-author" />
        </label>
        <label className="field title-field">
          <span>材料(なくてもよい)</span>
          <input value={material} onChange={(e) => onMaterial(e.target.value)} placeholder="例: PLA、ヒノキ" data-testid="drawing-material" />
        </label>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose} data-testid="title-block-ok">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
