// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 作った人(学籍番号・氏名)。2026-11-11 提出も学籍番号にそろえた(組・番号は前の版のなごり)。
// 端末に覚えておき(次の作品にも使う)、作品にも保存する(図面の表題欄・提出に使う)。

import type { Author } from "../doc/types";

const STUDENT_KEY = "student-cad:student";
/** 前の版で図面の名前だけを覚えていた所(古い端末のために読む) */
const OLD_NAME_KEY = "student-cad:author";

export const emptyAuthor = (): Author => ({ studentId: "", klass: "", number: "", name: "" });

/** 端末に覚えている作った人 */
export function readDeviceAuthor(): Author {
  try {
    const s = JSON.parse(localStorage.getItem(STUDENT_KEY) ?? "null") as Author | null;
    if (s) return { ...emptyAuthor(), ...s };
    return { ...emptyAuthor(), name: localStorage.getItem(OLD_NAME_KEY) ?? "" };
  } catch {
    return emptyAuthor();
  }
}

export function saveDeviceAuthor(a: Author) {
  try {
    localStorage.setItem(STUDENT_KEY, JSON.stringify(a));
    localStorage.setItem(OLD_NAME_KEY, a.name);
  } catch {
    // 保存できなくても、その場では使える
  }
}

/** 表題欄の氏名の欄に書く形(例 "2312 技術 太郎")。入っている所だけつなぐ */
export function authorLabel(a: Author | undefined): string {
  if (!a) return "";
  return [a.studentId?.trim(), a.name.trim()].filter(Boolean).join(" ");
}

/** 全角の数字を半角にし、数字でない文字をのぞく(学籍番号の入力用。図面と提出で使う) */
export const digitsOnly = (v: string) => v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");

/** 学籍番号が 4 けたの数字か */
export const isStudentId = (v: string) => /^[0-9]{4}$/.test(v.trim());

/** ファイル名に使えない文字と空白をとる */
const safe = (v: string) => v.replace(/[\\/:*?"<>|\s]+/g, "");

/**
 * 保存するファイルの名前(拡張子なし)。「学籍番号_氏名_作品名」(例 "2312_技術太郎_マグカップ")。
 * 入っていない所は とばす。
 */
export function fileBaseName(a: Author | undefined, title: string, suffix?: string): string {
  return [a?.studentId, a?.name, title || "作品", suffix].map((v) => safe(v ?? "")).filter(Boolean).join("_");
}
