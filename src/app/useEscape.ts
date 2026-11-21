// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef } from "react";

/**
 * Esc キーで、いちばん上に出ている画面(パネル・確認・数字キーパッドなど)だけを とじる。2026-11-21 追加。
 * Chromebook でキーボードを使う生徒が、パネルを Esc で とじられなかったため。
 * 重なっているとき(パネルの上の数字キーパッドなど)は、あとから出たものだけが とじる。
 */
const stack: { current: () => void }[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing || stack.length === 0) return;
  e.preventDefault();
  stack[stack.length - 1].current();
}

export function useEscape(close: () => void) {
  // close は毎回新しい関数になるので、最新のものを覚えておく
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    const entry = ref;
    if (stack.length === 0) window.addEventListener("keydown", onKeyDown);
    stack.push(entry);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      if (stack.length === 0) window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
