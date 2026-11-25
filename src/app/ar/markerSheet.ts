// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// マーカーAR で使う、印刷用のマーカー(A4 たて)。2026-11-20 追加。
//
// マーカーは ArUco の「ARUCO_MIP_36h12」の 0 番。黒い四角(ふちをふくむ)を 1 辺 100mm で印刷する。
// カメラは この黒い四角の大きさを ものさし にして、立体を実物大で乗せる。
// だから「実際のサイズ(100%)」で印刷し、黒い四角が 10cm あるか定規でたしかめる。

import { Dictionary } from "./aruco";

/** マーカーの種類と番号 */
export const MARKER_DICTIONARY = "ARUCO_MIP_36h12";
export const MARKER_ID = 0;
/** 黒い四角の 1 辺(mm) */
export const MARKER_MM = 100;

/** マーカーのマス目(黒いふちをふくむ)。true が白。外がわ 1 マスは黒いふち */
export function markerCells(): boolean[][] {
  const dict = new Dictionary(MARKER_DICTIONARY);
  const code = dict.codeList[MARKER_ID];
  const inner = Math.round(Math.sqrt(code.length)); // 6
  const n = inner + 2; // 8(ふちをふくむ)
  const cells: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x++) {
      const border = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      row.push(!border && code[(y - 1) * inner + (x - 1)] === "1");
    }
    cells.push(row);
  }
  return cells;
}

/** マーカーだけの SVG(座標は mm)。x, y は黒い四角の左上 */
function markerGroup(x: number, y: number): string {
  const cells = markerCells();
  const unit = MARKER_MM / cells.length;
  // 白いマスは 1 本の path にまとめる(マスを 1 つずつ四角でかくと、となりとの間に細いすき間の線が出るため)
  let d = "";
  cells.forEach((row, cy) =>
    row.forEach((white, cx) => {
      if (white) d += `M${x + cx * unit} ${y + cy * unit}h${unit}v${unit}h${-unit}z`;
    }),
  );
  return (
    `<rect x="${x}" y="${y}" width="${MARKER_MM}" height="${MARKER_MM}" fill="#000"/>` +
    `<path d="${d}" fill="#fff" shape-rendering="crispEdges"/>`
  );
}

/** 10cm の目もり(1mm・5mm・10mm)。実物大で印刷できたか、定規と見くらべる */
function ruler(x: number, y: number): string {
  let out = `<line x1="${x}" y1="${y}" x2="${x + 100}" y2="${y}" stroke="#000" stroke-width="0.3"/>`;
  for (let i = 0; i <= 100; i++) {
    const h = i % 10 === 0 ? 6 : i % 5 === 0 ? 4 : 2;
    out += `<line x1="${x + i}" y1="${y}" x2="${x + i}" y2="${y + h}" stroke="#000" stroke-width="0.2"/>`;
    if (i % 10 === 0) out += `<text x="${x + i}" y="${y + 10.5}" font-size="3.5" text-anchor="middle">${i / 10}</text>`;
  }
  out += `<text x="${x + 103}" y="${y + 10.5}" font-size="3.5">cm</text>`;
  return out;
}

/** A4 たての印刷用シート(SVG、単位 mm) */
export function markerSheetSvg(): string {
  const W = 210;
  const H = 297;
  const mx = (W - MARKER_MM) / 2;
  const my = 60;
  const font = `font-family="'BIZ UDPGothic','Hiragino Sans','Noto Sans JP',sans-serif"`;
  const lines = [
    "1. 「実際のサイズ(100%)」で印刷し、黒い四角が 10cm あるか定規でたしかめる",
    "2. 机の上に置くか、手に持ってカメラにうつす(折ったり曲げたりしない)",
    "3. 立体は、黒い四角の真ん中に 実物と同じ大きさ で乗ります",
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" ${font}>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<text x="${W / 2}" y="28" font-size="9" font-weight="700" text-anchor="middle">Student-CAD  ARマーカー</text>`,
    `<text x="${W / 2}" y="40" font-size="4.5" text-anchor="middle">この紙をカメラにうつすと、作った立体が乗って見えます</text>`,
    // まわりの白い余白(マーカーを見つけやすくする)を細い線で示す
    `<rect x="${mx - 12}" y="${my - 12}" width="${MARKER_MM + 24}" height="${MARKER_MM + 24}" fill="none" stroke="#bbb" stroke-width="0.3" stroke-dasharray="2 2"/>`,
    markerGroup(mx, my),
    `<text x="${W / 2}" y="${my + MARKER_MM + 20}" font-size="4.5" text-anchor="middle">▲ 黒い四角の 1 辺は 10cm(この下の目もりと同じ長さ)</text>`,
    ruler(mx, my + MARKER_MM + 28),
    ...lines.map((t, i) => `<text x="25" y="${my + MARKER_MM + 60 + i * 9}" font-size="4.2">${t}</text>`),
    `<text x="${W / 2}" y="${H - 12}" font-size="3" fill="#666" text-anchor="middle">マーカー: ArUco ${MARKER_DICTIONARY} 番号 ${MARKER_ID} / © 2026 技術科 岡田(MIT)</text>`,
    `</svg>`,
  ].join("");
}

/** マーカーのシートを印刷する(見えない iframe で、A4 たてにして印刷の画面を出す) */
export function printMarkerSheet(): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.title = "ARマーカーの印刷";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>ARマーカー</title>` +
      `<style>@page{size:A4 portrait;margin:0}html,body{margin:0}svg{display:block}</style></head>` +
      `<body>${markerSheetSvg()}</body></html>`,
  );
  doc.close();
  const win = frame.contentWindow!;
  win.addEventListener("afterprint", () => frame.remove());
  // 少し待ってから印刷する(中身の準備ができる前に印刷すると白い紙になることがある)
  setTimeout(() => {
    win.focus();
    win.print();
  }, 100);
}
