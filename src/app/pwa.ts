// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// オフラインで開くための Service Worker を登録し、その様子を画面に知らせる(2026-11-23 追加)。
// Service Worker 本体は pwa/service-worker.js(ビルドで dist/sw.js になる)。

import { useSyncExternalStore } from "react";

export interface PwaState {
  /** この端末にアプリがしまわれ、ネットがなくても開ける */
  offlineReady: boolean;
  /** 新しい版をしまい終えて、「開き直す」を待っている */
  updateReady: boolean;
}

let state: PwaState = { offlineReady: false, updateReady: false };
const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** 画面で使う: いまの様子 */
export function usePwaState(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** 「開き直す」: 待っている新しい版を動かして、ページを読みこみ直す */
export function applyUpdate() {
  if (!waiting) return location.reload();
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  waiting.postMessage("skip-waiting");
}

/** しまい終わった Service Worker が、新しい版か(前の版が動いているときだけ「新しい版」) */
function watchInstalling(sw: ServiceWorker) {
  sw.addEventListener("statechange", () => {
    if (sw.state !== "installed") return;
    if (navigator.serviceWorker.controller) {
      waiting = sw;
      set({ updateReady: true });
    } else {
      set({ offlineReady: true });
    }
  });
}

/**
 * Service Worker を登録する。本番のビルドだけで動かす(開発中はファイルが毎回変わるため)。
 * 登録できないブラウザや、ファイルを直接開いたときは、何もしない(ふつうにネットから読む)。
 */
export async function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    if (reg.active && navigator.serviceWorker.controller) set({ offlineReady: true });
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting;
      set({ updateReady: true });
    }
    if (reg.installing) watchInstalling(reg.installing);
    reg.addEventListener("updatefound", () => reg.installing && watchInstalling(reg.installing));
    // 開いたままの端末でも、1時間ごとに新しい版を確かめる
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  } catch (e) {
    console.warn("オフライン用の登録ができませんでした", e);
  }
}
