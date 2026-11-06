// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import type { CadDocument } from "../doc/types";

// 作品は端末の中(IndexedDB)だけに自動保存する。アカウントもサーバーも使わない。
const DB = "student-cad";
const STORE = "docs";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDoc(): Promise<CadDocument | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(isDoc(req.result) ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveDoc(doc: CadDocument): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(doc, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("保存できませんでした", tx.error);
        resolve(false);
      };
    });
  } catch (e) {
    console.warn("保存できませんでした", e);
    return false;
  }
}

/** 作業の種類ごとに、なくてはならない一覧(これがないと形の計算や画面がこわれる) */
const REQUIRED_LISTS: Record<string, string[]> = {
  sketch: ["entities", "constraints"],
  fillet: ["edges"],
  loft: ["sketchIds"],
  shell: ["faces"],
};

/**
 * Student CAD の作品ファイルか。
 * こわれたファイル(途中で切れた・手でなおした など)を開いて画面が止まらないよう、作業の形も確かめる。
 */
export function isDoc(v: unknown): v is CadDocument {
  if (!v || typeof v !== "object") return false;
  const d = v as CadDocument;
  if (d.format !== "student-cad" || !Array.isArray(d.features)) return false;
  if (d.variables !== undefined && !Array.isArray(d.variables)) return false;
  return d.features.every((f) => {
    if (!f || typeof f !== "object" || typeof f.id !== "string" || typeof f.type !== "string") return false;
    const lists = REQUIRED_LISTS[f.type] ?? [];
    return lists.every((k) => Array.isArray((f as unknown as Record<string, unknown>)[k]));
  });
}

export function downloadFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
