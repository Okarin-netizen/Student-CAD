// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// ボタンの説明を出す。
// マウス: ボタンにのせて少し待つと出る。タブレット: ボタンを長押しすると出る(そのときボタンは押されない)。

import { useEffect, useRef, useState } from "react";
import { tipFor } from "./tips";

const HOVER_MS = 450;
const LONG_PRESS_MS = 500;
/** 長押しで出した説明を見せておく時間 */
const TOUCH_SHOW_MS = 3500;

interface Shown {
  text: string;
  /** 説明を出す元のボタンの四角(画面の px) */
  rect: DOMRect;
}

/** data-tip か、説明のある data-testid を持つ、いちばん近い要素 */
function tipTarget(t: EventTarget | null): Element | null {
  let el = t instanceof Element ? t : null;
  while (el) {
    if (tipFor(el)) return el;
    el = el.parentElement;
  }
  return null;
}

export function TipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number>(0);
  const hideTimer = useRef<number>(0);
  /** 長押しで説明を出したあとの「クリック」は、ボタンを押したことにしない */
  const swallowClick = useRef(false);
  const pressStart = useRef<[number, number] | null>(null);

  useEffect(() => {
    const show = (el: Element) => {
      const text = tipFor(el);
      if (text) setShown({ text, rect: el.getBoundingClientRect() });
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      setShown(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = tipTarget(e.target);
      window.clearTimeout(timer.current);
      if (!el) return setShown(null);
      timer.current = window.setTimeout(() => show(el), HOVER_MS);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return hide();
      const el = tipTarget(e.target);
      window.clearTimeout(timer.current);
      if (!el) return;
      pressStart.current = [e.clientX, e.clientY];
      timer.current = window.setTimeout(() => {
        show(el);
        swallowClick.current = true;
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setShown(null), TOUCH_SHOW_MS);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      // 指が動いたら(画面を動かしているなど)長押しにしない
      const p = pressStart.current;
      if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 10) {
        window.clearTimeout(timer.current);
        pressStart.current = null;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") window.clearTimeout(timer.current);
      pressStart.current = null;
    };
    const onClick = (e: MouseEvent) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      hide();
    };
    // 長押しで出る文字のメニュー(コピーなど)を出さない
    const onContext = (e: Event) => {
      if (tipTarget(e.target)) e.preventDefault();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContext);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(hideTimer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!shown) return null;
  // ボタンの下に出す。画面の下にはみ出すときは上に出す。左右は画面の中におさめる
  const { rect } = shown;
  const width = Math.min(320, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
  const below = rect.bottom + 120 < window.innerHeight;
  const style = below ? { left, width, top: rect.bottom + 8 } : { left, width, bottom: window.innerHeight - rect.top + 8 };
  return (
    <div className="tip" role="tooltip" style={style} data-testid="tip">
      {shown.text}
    </div>
  );
}
