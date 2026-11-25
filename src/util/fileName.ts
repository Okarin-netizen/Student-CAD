// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 保存するファイルの名前を作る。2026-11-25 追加(全体の点検)。
// 前は 図面(author.ts)と提出(submission.ts)で別々の決まりがあり、「A/B」が図面では「AB」、
// 提出では「A_B」になっていた。また STL・3MF・STEP・作品ファイルは、名前をそのまま使っていた。
// ここで1つの決まりにそろえる。

/** Windows・iPad・Chromebook のどれでもファイル名に使えない文字 */
const BAD_CHARS = /[\\/:*?"<>|]+/g;

/**
 * ファイル名に使える文字だけにする。
 * - 空白はとる(「技術 太郎」→「技術太郎」)
 * - 使えない文字は「_」にする(「A/B」→「A_B」)
 * - 前後の「_」はとる。何も残らなければ空の文字
 */
export function safeFileName(name: string): string {
  return name.replace(/\s+/g, "").replace(BAD_CHARS, "_").replace(/^_+|_+$/g, "");
}

/** 作品の名前から、拡張子つきのファイル名を作る(名前が空なら「作品」) */
export function docFileName(docName: string, ext: string): string {
  return `${safeFileName(docName) || "作品"}.${ext}`;
}
