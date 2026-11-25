// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 「ファイル」→「新しく作る」の画面。白紙か、課題のひな形をえらぶ。
// 2026-11-25 見出しを「新しく始める」から、トップページと同じ「新しく作る」にそろえた。

import type { Template } from "../doc/templates";
import { TemplateButtons } from "./TemplateButtons";
import { useEscape } from "./useEscape";

interface Props {
  /** いまの作品に作業があるか(あれば、閉じてよいか注意を出す) */
  hasWork: boolean;
  onPick: (t: Template) => void;
  onClose: () => void;
}

export function NewDialog({ hasWork, onPick, onClose }: Props) {
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog new-dialog" role="dialog" aria-label="新しく作る">
        <h3>新しく作る</h3>
        {hasWork && <p className="panel-warning">いまの作品は閉じます。「もどす」ではもどせないので、残したいときは先に「ファイルに保存」してください。</p>}
        <TemplateButtons className="template-grid" testId="templates" buttonTestIdPrefix="template-" onPick={onPick} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}
