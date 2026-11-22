// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 作品を端末(IndexedDB)へ自動で保存する。2026-11-22 App.tsx から分けた。

import { useEffect, useRef, useState } from "react";
import type { CadDocument } from "../doc/types";
import { saveDoc } from "./persist";
import { docForSave, getState, toast, type State } from "./store";

/** 最後に変えてから保存するまで待つ時間(ms)。続けて変えたときに何度も保存しないため */
const SAVE_DELAY_MS = 300;

/**
 * 設計図・図面の手直し・作った人が変わったら、少し待ってから保存する。
 * タブを閉じる・アプリを切り替えるときは、待たずに保存する。
 * 返すのは、最後に保存できた設計図(いまの設計図と同じなら「保存ずみ」)。
 */
export function useAutoSave(s: Pick<State, "doc" | "drawing" | "meta">, loaded: boolean): CadDocument | null {
  const [savedDoc, setSavedDoc] = useState<CadDocument | null>(null);
  /** 保存できなかったことを、もう知らせたか(何度も同じ知らせを出さないため) */
  const warned = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    const doc = s.doc;
    const save = () =>
      saveDoc(docForSave(getState())).then((ok) => {
        if (ok) {
          warned.current = false;
          setSavedDoc(doc);
        } else if (!warned.current) {
          // 保存できない端末(容量がいっぱい・プライベートモードなど)では「保存中…」のまま止まって見えていた(2026-11-22)
          warned.current = true;
          toast("この端末に保存できませんでした。「ファイル」→「ファイルに保存」で作品を残してください", "error");
        }
      });
    const t = setTimeout(save, SAVE_DELAY_MS);
    const saveNowIfHidden = () => document.visibilityState === "hidden" && void save();
    document.addEventListener("visibilitychange", saveNowIfHidden);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", saveNowIfHidden);
    };
  }, [s.doc, s.drawing, s.meta.author, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return savedDoc;
}
