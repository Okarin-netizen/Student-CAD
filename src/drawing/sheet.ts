// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 図面(A4 横の用紙)を組み立てて、SVG と DXF にする。
// 座標は用紙の mm で、左下が (0, 0)、上が +y(DXF と同じ)。SVG にするときだけ上下を入れかえる。

import type { Vec2 } from "../doc/types";
import type { DrawingKind, ProjectedView } from "../kernel/projection";

export const PAPER = { width: 297, height: 210 } as const;

/** 外形線・かくれ線・寸法線(細線)・わく・中心線(一点鎖線) */
export type LineStyle = "visible" | "hidden" | "dim" | "frame" | "center";

export interface SheetLine {
  style: LineStyle;
  points: Vec2[];
}

export interface SheetText {
  at: Vec2;
  text: string;
  /** 文字の高さ(mm) */
  size: number;
  anchor: "start" | "middle" | "end";
  /** 反時計回りの角度(度) */
  rotate?: number;
}

export interface Sheet {
  kind: DrawingKind;
  /** 尺度の表示(例: "1:2") */
  scaleLabel: string;
  lines: SheetLine[];
  texts: SheetText[];
}

export interface SheetOptions {
  kind: DrawingKind;
  /** 作品名 */
  title: string;
  /** かいた人の名前 */
  author: string;
  /** 全体の寸法(はば・高さ・奥行き)を入れるか。第三角法のときだけ */
  dimensions: boolean;
}

export const KIND_LABELS: Record<DrawingKind, string> = {
  thirdAngle: "第三角法(正面図・平面図・右側面図)",
  isometric: "等角図",
  cabinet: "キャビネット図",
};

/** JIS の尺度(大きい順)。用紙に入る一番大きいものを使う */
const SCALES: { s: number; label: string }[] = [
  { s: 10, label: "10:1" },
  { s: 5, label: "5:1" },
  { s: 2, label: "2:1" },
  { s: 1, label: "1:1" },
  { s: 1 / 2, label: "1:2" },
  { s: 1 / 5, label: "1:5" },
  { s: 1 / 10, label: "1:10" },
  { s: 1 / 20, label: "1:20" },
  { s: 1 / 50, label: "1:50" },
  { s: 1 / 100, label: "1:100" },
];

// 用紙のわく(左下 10mm、右上 287×200)と表題欄(右下 100×28)
const FRAME = { x0: 10, y0: 10, x1: 287, y1: 200 };
const TITLE = { w: 110, h: 28 };
/** 図をかける場所(表題欄の上と、わくの内側) */
const AREA = { x0: 18, y0: FRAME.y0 + TITLE.h + 6, x1: 279, y1: 194 };
/** 図と図のすき間、寸法のための余白(用紙の mm) */
const GAP = 22;
const DIM_ROOM = 14;

interface Box {
  min: Vec2;
  max: Vec2;
}

export function viewBounds(v: ProjectedView): Box | null {
  let min: Vec2 = [Infinity, Infinity];
  let max: Vec2 = [-Infinity, -Infinity];
  for (const line of [...v.visible, ...v.hidden]) {
    for (const [x, y] of line) {
      min = [Math.min(min[0], x), Math.min(min[1], y)];
      max = [Math.max(max[0], x), Math.max(max[1], y)];
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

const size = (b: Box): Vec2 => [b.max[0] - b.min[0], b.max[1] - b.min[1]];

/** 用紙に入る一番大きな尺度 */
function pickScale(modelW: number, modelH: number, extraW: number, extraH: number) {
  const availW = AREA.x1 - AREA.x0 - extraW;
  const availH = AREA.y1 - AREA.y0 - extraH;
  return SCALES.find((c) => modelW * c.s <= availW && modelH * c.s <= availH) ?? SCALES.at(-1)!;
}

/** 図面を組み立てる */
export function buildSheet(views: ProjectedView[], opts: SheetOptions): Sheet {
  const lines: SheetLine[] = [];
  const texts: SheetText[] = [];
  let scaleLabel = "1:1";

  /** view の左下を at に置き、尺度 s でかく。円には中心線を入れ、diameters なら直径も書く */
  const place = (v: ProjectedView, b: Box, at: Vec2, s: number, diameters = false) => {
    const map = (p: Vec2): Vec2 => [at[0] + (p[0] - b.min[0]) * s, at[1] + (p[1] - b.min[1]) * s];
    for (const l of v.hidden) lines.push({ style: "hidden", points: l.map(map) });
    for (const l of v.visible) lines.push({ style: "visible", points: l.map(map) });
    // 同じ中心の円(マグカップの外側と内側など)は、中心線を1回だけ引き、直径の引き出し線の向きを変えて文字が重ならないようにする
    for (const group of concentric(v.circles)) {
      const [cx, cy] = map(group[0].c);
      const r = group[0].r * s + 2;
      lines.push({ style: "center", points: [[cx - r, cy], [cx + r, cy]] }, { style: "center", points: [[cx, cy - r], [cx, cy + r]] });
      // 直径は一番外と一番内だけ書く(角を丸めた所にできる円まで書くと、数字が多すぎて読めない)
      const labeled = group.length > 2 ? [group[0], group[group.length - 1]] : group;
      if (diameters) labeled.forEach((c, i) => diameter(lines, texts, [cx, cy], c.r * s, c.r * 2, LEADER_DIRS[i]));
    }
  };

  const boxes = views.map(viewBounds);
  if (opts.kind === "thirdAngle" && boxes.every(Boolean)) {
    const [fb, tb, rb] = boxes as Box[];
    const [W, H] = size(fb);
    const D = size(tb)[1];
    const dimRoom = opts.dimensions ? DIM_ROOM : 0;
    const scale = pickScale(W + D, H + D, GAP + dimRoom * 2, GAP + dimRoom * 2);
    const s = scale.s;
    scaleLabel = scale.label;
    // 正面図を左下、平面図をその上、右側面図をその右に置き、全体を真ん中にする
    const groupW = (W + D) * s + GAP;
    const groupH = (H + D) * s + GAP;
    const ox = (AREA.x0 + AREA.x1 - groupW) / 2 + dimRoom / 2;
    const oy = (AREA.y0 + AREA.y1 - groupH) / 2 + dimRoom / 2;
    place(views[0], fb, [ox, oy], s);
    place(views[1], tb, [ox, oy + H * s + GAP], s, opts.dimensions);
    place(views[2], rb, [ox + W * s + GAP, oy], s);
    labelView(texts, "正面図", [ox + (W * s) / 2, oy - (opts.dimensions ? DIM_ROOM + 5 : 6)]);
    labelView(texts, "平面図", [ox + (W * s) / 2, oy + H * s + GAP + D * s + 3]);
    labelView(texts, "右側面図", [ox + W * s + GAP + (D * s) / 2, oy - (opts.dimensions ? DIM_ROOM + 5 : 6)]);
    if (opts.dimensions) {
      dimension(lines, texts, [ox, oy], [ox + W * s, oy], -9, W, "below");
      dimension(lines, texts, [ox, oy], [ox, oy + H * s], -9, H, "left");
      dimension(lines, texts, [ox + W * s + GAP, oy], [ox + W * s + GAP + D * s, oy], -9, D, "below");
    }
  } else if (boxes[0]) {
    const b = boxes[0];
    const [w, h] = size(b);
    const scale = pickScale(w, h, 0, 0);
    scaleLabel = scale.label;
    const at: Vec2 = [(AREA.x0 + AREA.x1 - w * scale.s) / 2, (AREA.y0 + AREA.y1 - h * scale.s) / 2];
    place(views[0], b, at, scale.s);
  }

  frameAndTitle(lines, texts, opts, scaleLabel);
  return { kind: opts.kind, scaleLabel, lines, texts };
}

function labelView(texts: SheetText[], text: string, at: Vec2) {
  texts.push({ at, text, size: 3.5, anchor: "middle" });
}

/**
 * 寸法をかく(寸法補助線・矢印つきの寸法線・数字)。
 * a→b は図の上の2点、offset は図からはなす距離(mm)、value は実物の長さ。
 */
function dimension(lines: SheetLine[], texts: SheetText[], a: Vec2, b: Vec2, offset: number, value: number, side: "below" | "left") {
  const text = formatMm(value);
  const arrow = 2.5;
  if (side === "below") {
    const y = a[1] + offset;
    lines.push({ style: "dim", points: [a, [a[0], y - 1.5]] }, { style: "dim", points: [b, [b[0], y - 1.5]] });
    lines.push({ style: "dim", points: [[a[0], y], [b[0], y]] });
    lines.push({ style: "dim", points: [[a[0] + arrow, y + 0.9], [a[0], y], [a[0] + arrow, y - 0.9]] });
    lines.push({ style: "dim", points: [[b[0] - arrow, y + 0.9], [b[0], y], [b[0] - arrow, y - 0.9]] });
    texts.push({ at: [(a[0] + b[0]) / 2, y + 1.2], text, size: 3.5, anchor: "middle" });
  } else {
    const x = a[0] + offset;
    lines.push({ style: "dim", points: [a, [x - 1.5, a[1]]] }, { style: "dim", points: [b, [x - 1.5, b[1]]] });
    lines.push({ style: "dim", points: [[x, a[1]], [x, b[1]]] });
    lines.push({ style: "dim", points: [[x - 0.9, a[1] + arrow], [x, a[1]], [x + 0.9, a[1] + arrow]] });
    lines.push({ style: "dim", points: [[x - 0.9, b[1] - arrow], [x, b[1]], [x + 0.9, b[1] - arrow]] });
    texts.push({ at: [x - 1.2, (a[1] + b[1]) / 2], text, size: 3.5, anchor: "middle", rotate: 90 });
  }
}

/** 直径の引き出し線の向き(外の円は右上、内の円は左上) */
const LEADER_DIRS: Vec2[] = [
  [1, 1],
  [-1, 1],
];

/** 中心が同じ円をまとめる。大きい円を先にする */
function concentric(circles: ProjectedView["circles"]): ProjectedView["circles"][] {
  const groups: ProjectedView["circles"][] = [];
  for (const c of [...circles].sort((a, b) => b.r - a.r)) {
    const g = groups.find((g) => Math.hypot(g[0].c[0] - c.c[0], g[0].c[1] - c.c[1]) < 1e-3 * Math.max(1, g[0].r));
    if (!g) groups.push([c]);
    else if (!g.some((o) => Math.abs(o.r - c.r) < 1e-3 * Math.max(1, c.r))) g.push(c);
  }
  return groups;
}

/** 円の直径(「⌀8」)を、dir の向き(斜め45°)に引き出してかく */
function diameter(lines: SheetLine[], texts: SheetText[], c: Vec2, rPaper: number, value: number, dir: Vec2 = [1, 1]) {
  const [sx, sy] = dir;
  const d = Math.SQRT1_2;
  const edge: Vec2 = [c[0] + sx * rPaper * d, c[1] + sy * rPaper * d];
  const elbow: Vec2 = [edge[0] + sx * 5, edge[1] + sy * 5];
  const text = `⌀${formatMm(value)}`;
  const end: Vec2 = [elbow[0] + sx * (text.length * 2.2 + 1), elbow[1]];
  lines.push({ style: "dim", points: [edge, elbow, end] });
  lines.push({ style: "dim", points: [[edge[0] + sx * 2.2, edge[1] + sy * 0.8], edge, [edge[0] + sx * 0.8, edge[1] + sy * 2.2]] });
  texts.push({ at: [elbow[0] + sx * 0.5, elbow[1] + 1], text, size: 3.2, anchor: sx > 0 ? "start" : "end" });
}

/** わくと表題欄 */
function frameAndTitle(lines: SheetLine[], texts: SheetText[], opts: SheetOptions, scaleLabel: string) {
  const { x0, y0, x1, y1 } = FRAME;
  lines.push({ style: "frame", points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] });
  const tx = x1 - TITLE.w;
  const ty = y0 + TITLE.h;
  const row = TITLE.h / 4;
  lines.push({ style: "frame", points: [[tx, y0], [tx, ty], [x1, ty]] });
  for (let i = 1; i < 4; i++) lines.push({ style: "dim", points: [[tx, y0 + row * i], [x1, y0 + row * i]] });
  lines.push({ style: "dim", points: [[tx + 22, y0], [tx + 22, ty]] });
  const rows: [string, string][] = [
    ["作品名", opts.title || "(なし)"],
    ["名前", opts.author || ""],
    ["図", KIND_LABELS[opts.kind]],
    ["尺度", `${scaleLabel}   単位 mm`],
  ];
  rows.forEach(([k, v], i) => {
    const y = ty - row * (i + 1) + 2;
    texts.push({ at: [tx + 11, y], text: k, size: 3, anchor: "middle" });
    texts.push({ at: [tx + 25, y], text: v, size: 3.2, anchor: "start" });
  });
}

/** 寸法の数字。整数ならそのまま、そうでなければ小数1けたまで */
export function formatMm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---- SVG ----

const SVG_STYLE: Record<LineStyle, string> = {
  visible: 'stroke="#000" stroke-width="0.5"',
  hidden: 'stroke="#000" stroke-width="0.3" stroke-dasharray="2.5 1.2"',
  dim: 'stroke="#000" stroke-width="0.2"',
  frame: 'stroke="#000" stroke-width="0.7"',
  center: 'stroke="#000" stroke-width="0.2" stroke-dasharray="5 1 1 1"',
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v: number) => String(Math.round(v * 100) / 100);

/** 図面を SVG の文字列にする(大きさは実際の mm) */
export function sheetToSVG(sheet: Sheet): string {
  const H = PAPER.height;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.width}mm" height="${H}mm" viewBox="0 0 ${PAPER.width} ${H}">`,
    `<rect width="${PAPER.width}" height="${H}" fill="#fff"/>`,
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">',
  ];
  for (const l of sheet.lines) {
    out.push(`<polyline ${SVG_STYLE[l.style]} points="${l.points.map(([x, y]) => `${n2(x)},${n2(H - y)}`).join(" ")}"/>`);
  }
  out.push("</g>", '<g fill="#000" font-family="sans-serif">');
  for (const t of sheet.texts) {
    const [x, y] = [n2(t.at[0]), n2(H - t.at[1])];
    const rot = t.rotate ? ` transform="rotate(${-t.rotate} ${x} ${y})"` : "";
    out.push(`<text x="${x}" y="${y}" font-size="${t.size}" text-anchor="${t.anchor}"${rot}>${esc(t.text)}</text>`);
  }
  out.push("</g>", "</svg>");
  return out.join("\n");
}

// ---- DXF(AutoCAD R12 形式。レーザー加工機や多くの CAD で開ける) ----

const DXF_LAYERS: Record<LineStyle, { name: string; ltype: string; color: number }> = {
  visible: { name: "OUTLINE", ltype: "CONTINUOUS", color: 7 },
  hidden: { name: "HIDDEN", ltype: "DASHED", color: 8 },
  dim: { name: "DIMENSION", ltype: "CONTINUOUS", color: 3 },
  frame: { name: "FRAME", ltype: "CONTINUOUS", color: 7 },
  center: { name: "CENTER", ltype: "CENTER", color: 1 },
};

/** 日本語は R12 の決まりで \U+XXXX と書く */
const dxfText = (s: string) => [...s].map((c) => (c.charCodeAt(0) < 128 ? c : `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)).join("");

export function linesToDXF(lines: SheetLine[], texts: SheetText[] = []): string {
  const o: (string | number)[] = [];
  const g = (code: number, value: string | number) => o.push(code, value);
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$MEASUREMENT"); g(70, 1);
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 3);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "LTYPE"); g(2, "DASHED"); g(70, 0); g(3, "Dashed"); g(72, 65); g(73, 2); g(40, 3.7); g(49, 2.5); g(49, -1.2);
  g(0, "LTYPE"); g(2, "CENTER"); g(70, 0); g(3, "Center"); g(72, 65); g(73, 4); g(40, 8); g(49, 5); g(49, -1); g(49, 1); g(49, -1);
  g(0, "ENDTAB");
  const used = [...new Set(Object.values(DXF_LAYERS).map((l) => l.name))];
  g(0, "TABLE"); g(2, "LAYER"); g(70, used.length);
  for (const l of Object.values(DXF_LAYERS).filter((x, i, a) => a.findIndex((y) => y.name === x.name) === i)) {
    g(0, "LAYER"); g(2, l.name); g(70, 0); g(62, l.color); g(6, l.ltype);
  }
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const l of lines) {
    const layer = DXF_LAYERS[l.style];
    for (let i = 0; i + 1 < l.points.length; i++) {
      const [a, b] = [l.points[i], l.points[i + 1]];
      g(0, "LINE"); g(8, layer.name); g(6, layer.ltype);
      g(10, n4(a[0])); g(20, n4(a[1])); g(30, 0);
      g(11, n4(b[0])); g(21, n4(b[1])); g(31, 0);
    }
  }
  for (const t of texts) {
    const h = t.anchor === "middle" ? 1 : t.anchor === "end" ? 2 : 0;
    g(0, "TEXT"); g(8, "TEXT");
    g(10, n4(t.at[0])); g(20, n4(t.at[1])); g(30, 0);
    g(40, t.size); g(1, dxfText(t.text));
    if (t.rotate) g(50, t.rotate);
    if (h) {
      g(72, h);
      g(11, n4(t.at[0])); g(21, n4(t.at[1])); g(31, 0);
    }
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return o.join("\r\n") + "\r\n";
}

export const sheetToDXF = (sheet: Sheet) => linesToDXF(sheet.lines, sheet.texts);

/**
 * レーザー加工機用: 上から見た形(見える線だけ)を 1:1 で、わくも文字もなしにする。
 * 左下が (0, 0) になるように動かす。
 */
export function laserDXF(top: ProjectedView): string {
  const b = viewBounds(top);
  if (!b) return linesToDXF([]);
  const lines = top.visible.map((l): SheetLine => ({ style: "visible", points: l.map(([x, y]) => [x - b.min[0], y - b.min[1]]) }));
  return linesToDXF(lines);
}

const n4 = (v: number) => Math.round(v * 1e4) / 1e4;
