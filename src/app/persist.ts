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

export function isDoc(v: unknown): v is CadDocument {
  return !!v && typeof v === "object" && (v as CadDocument).format === "student-cad" && Array.isArray((v as CadDocument).features);
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
