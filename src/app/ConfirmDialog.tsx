// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import type { ReactNode } from "react";

interface Props {
  /** 読み上げ用の名前 */
  label: string;
  title: ReactNode;
  /** 説明の文(なくてもよい) */
  children?: ReactNode;
  cancelText: string;
  okText: string;
  cancelTestId?: string;
  okTestId?: string;
  onCancel: () => void;
  onOk: () => void;
}

/** 「けしますか?」「捨てますか?」のような、やり直せない操作の前の確認。外をタップするとやめる */
export function ConfirmDialog({ label, title, children, cancelText, okText, cancelTestId, okTestId, onCancel, onOk }: Props) {
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-label={label}>
        <h3>{title}</h3>
        {children}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} data-testid={cancelTestId}>
            {cancelText}
          </button>
          <button type="button" className="danger" data-testid={okTestId} onClick={onOk}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
