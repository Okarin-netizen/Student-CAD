// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// Chromebook のキーボード: Ctrl+Z で もどす、Ctrl+Shift+Z / Ctrl+Y で やりなおす。
// 2026-11-22 App.tsx から分けた。

import { useEffect } from "react";
import { redo, undo } from "./store";

export function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 文字を入れている所では、入力欄の「もどす」を使う
      if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
      // 数字キーパッドなどの小さな画面が出ている間は、うしろの作品を変えない(2026-11-13)
      if (document.querySelector(".dialog-backdrop")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
