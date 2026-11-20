// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// iPad・iPhone の「AR クイックルック」で立体を開く。2026-11-20 追加。
//
// <a rel="ar" href="〇〇.usdz"><img></a> をタップすると、Safari がカメラの画面を開いて
// 立体を机の上などに置いてくれる。ここでは、その <a> を見えない所に作ってクリックする。
// ボタンを押したそのときに呼ぶこと(あとから呼ぶと、ブラウザが開いてくれないことがある)。

/** 前に作った USDZ の URL。新しく開くときに捨てる(メモリを使いすぎないように) */
let lastUrl: string | null = null;

export function openQuickLook(usdz: Uint8Array): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  const blob = new Blob([usdz as BlobPart], { type: "model/vnd.usdz+zip" });
  lastUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.rel = "ar";
  // AR クイックルックは、<a> の中に <img> がないと開かない
  a.appendChild(document.createElement("img"));
  // 指で大きさを変えられないようにして、いつも実物大で見せる
  a.href = `${lastUrl}#allowsContentScaling=0`;
  // ページには入れずにクリックする(model-viewer と同じやり方)
  a.click();
}
