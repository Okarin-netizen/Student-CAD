// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef } from "react";

/**
 * 横にスクロールするボタンの列(スマホの手順バー・絵の道具)に、
 * 「まだ右(左)にボタンがある」ことを はしのぼかしで見せる。2026-11-21 スマホ対応で追加。
 *
 * 列の要素に class を付けるだけ:
 *   more-left  … 左にかくれたボタンがある
 *   more-right … 右にかくれたボタンがある
 * 見た目(ぼかし)は app.css の「スマホ」の所で決める。
 *
 * focusSelector を渡すと、その要素(手順バーの「次に押すボタン」など)が変わるたびに
 * 列の中で見える所までスクロールする。
 */
export function useScrollHint<T extends HTMLElement>(focusKey?: unknown, focusSelector?: string) {
  const ref = useRef<T>(null);

  // スクロール・大きさの変化・中身の変化のたびに、はしの class を付けなおす
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle("more-left", el.scrollLeft > 2);
      el.classList.toggle("more-right", el.scrollLeft < max - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutate = new MutationObserver(update);
    mutate.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  // 次に押すボタンが列の外にあるときは、見える所まで動かす(ページ全体は動かさない)
  useEffect(() => {
    const el = ref.current;
    if (!el || !focusSelector || el.scrollWidth <= el.clientWidth) return;
    const target = el.querySelector<HTMLElement>(focusSelector);
    if (!target) return;
    const box = el.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    if (t.left >= box.left && t.right <= box.right) return;
    const left = el.scrollLeft + (t.left - box.left) - (box.width - t.width) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [focusKey, focusSelector]);

  return ref;
}
