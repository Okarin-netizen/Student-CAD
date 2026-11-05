// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 図面(A4 横の用紙)を組み立てて、SVG と DXF にする。
// 座標は用紙の mm で、左下が (0, 0)、上が +y(DXF と同じ)。SVG にするときだけ上下を入れかえる。

import type { DrawingNotes, Vec2 } from "../doc/types";
import type { DrawingKind, ProjectedView } from "../kernel/projection";

export const PAPER = { width: 297, height: 210 } as const;

/** 外形線・かくれ線・寸法線(細線)・わく・中心線(一点鎖線)・矢印(ぬりつぶした三角) */
export type LineStyle = "visible" | "hidden" | "dim" | "frame" | "center" | "arrow";

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
  /** 寸法ごとの名前と、数字のある所(図面の画面で、タップして消すのに使う) */
  dims: SheetDim[];
  /** 寸法を足すときに吸い付く点(線のはしと円の中心)。第三角法の図だけ */
  snaps: SheetSnap[];
}

export interface SheetDim {
  id: string;
  /** 手で足した寸法か */
  manual: boolean;
  box: Box;
}

export interface SheetSnap {
  /** どの図か(0 正面図・1 平面図・2 右側面図) */
  view: 0 | 1 | 2;
  /** 図の上の座標(実物の mm) */
  p: Vec2;
  /** 用紙の上の座標 */
  at: Vec2;
}

export interface SheetOptions {
  kind: DrawingKind;
  /** 作品名 */
  title: string;
  /** かいた人の名前 */
  author: string;
  /** 全体の寸法(はば・高さ・奥行き)を入れるか。第三角法のときだけ */
  dimensions: boolean;
  /** 材料(表題欄に書く。空なら手で書けるように空けておく) */
  material?: string;
  /** 日付(表題欄に書く。例 "2026/11/05") */
  date?: string;
  /** 寸法の手直し(消した自動の寸法と、手で足した寸法) */
  notes?: DrawingNotes;
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

// 用紙のわく(JIS: A4 は紙のはしから 10mm の輪郭線)と表題欄(右下 130×32)
const FRAME = { x0: 10, y0: 10, x1: 287, y1: 200 };
const TITLE = { w: 130, h: 32 };
/** 図をかける場所(表題欄の上と、わくの内側) */
const AREA = { x0: 18, y0: FRAME.y0 + TITLE.h + 6, x1: 279, y1: 194 };
/** 図と図のすき間、寸法のための余白(用紙の mm) */
const GAP = 22;
/** 寸法を2段(細かい寸法と全体の寸法)入れるための余白 */
const DIM_ROOM = 21;
/** 1段目・2段目の寸法線の、図からの距離 */
const DIM_ROW = [-9, -16];

export interface Box {
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
  const dims: SheetDim[] = [];
  const snaps: SheetSnap[] = [];
  const hidden = new Set(opts.notes?.hidden ?? []);

  /** 寸法を1つかき、名前をつけて覚える。消すことになっている自動の寸法は、かいたものを取り消す */
  const tag: Tagger = (id, manual, draw) => {
    const [l0, t0] = [lines.length, texts.length];
    draw();
    if (!manual && hidden.has(id)) {
      lines.length = l0;
      texts.length = t0;
      return;
    }
    const boxes = texts.slice(t0).map(textBox);
    if (boxes.length) dims.push({ id, manual, box: boxes.reduce(unionBox) });
  };

  /** すでに書いた半径(同じ R を何度も書かない) */
  const radii = new Set<string>();
  /** 半径の文字を置いた所(重ならないようにずらすのに使う) */
  const taken: Box[] = [];
  /** 三面図の、図の座標 → 用紙の座標 */
  const maps: ((p: Vec2) => Vec2)[] = [];
  /** 三面図の、用紙の上での四角 */
  const frames: Box[] = [];
  /** view の左下を at に置き、尺度 s でかく。円には中心線を入れ、diameters なら直径と半径も書く。index は三面図の何番目か */
  const place = (v: ProjectedView, b: Box, at: Vec2, s: number, diameters = false, index?: 0 | 1 | 2) => {
    const map = (p: Vec2): Vec2 => [at[0] + (p[0] - b.min[0]) * s, at[1] + (p[1] - b.min[1]) * s];
    if (index !== undefined) {
      maps[index] = map;
      frames[index] = { min: map(b.min), max: map(b.max) };
      // 寸法を足すときに吸い付く点: 線のはしと、円の中心
      const seen = new Set<string>();
      const add = (p: Vec2) => {
        const key = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
        if (seen.has(key)) return;
        seen.add(key);
        snaps.push({ view: index, p, at: map(p) });
      };
      for (const l of [...v.visible, ...v.hidden]) {
        add(l[0]);
        add(l[l.length - 1]);
      }
      for (const c of v.circles) add(c.c);
    }
    for (const l of v.hidden) lines.push({ style: "hidden", points: l.map(map) });
    for (const l of v.visible) lines.push({ style: "visible", points: l.map(map) });
    // 同じ中心の円(マグカップの外側と内側など)は、中心線を1回だけ引き、直径の引き出し線の向きを変えて文字が重ならないようにする
    for (const group of concentric(v.circles)) {
      const [cx, cy] = map(group[0].c);
      const r = group[0].r * s + 2;
      lines.push({ style: "center", points: [[cx - r, cy], [cx + r, cy]] }, { style: "center", points: [[cx, cy - r], [cx, cy + r]] });
      // 直径は一番外と一番内だけ書く(角を丸めた所にできる円まで書くと、数字が多すぎて読めない)
      const labeled = group.length > 2 ? [group[0], group[group.length - 1]] : group;
      if (diameters) labeled.forEach((c, i) => tag(`d${index}:${formatMm(c.c[0])},${formatMm(c.c[1])}:${formatMm(c.r * 2)}`, false, () => diameter(lines, texts, [cx, cy], c.r * s, c.r * 2, LEADER_DIRS[i])));
    }
    // 角の丸み・取っ手などの円弧は、半径(「R2」)を書く。同じ半径は図面の中で1回だけ
    if (diameters) {
      for (const arc of [...(v.arcs ?? [])].sort((p, q) => q.span - p.span)) {
        const label = `R${formatMm(arc.r)}`;
        if (radii.has(label) || arc.span < 0.3) continue;
        radii.add(label);
        tag(`r:${label}`, false, () => radius(lines, texts, map(arc.c), map(arc.mid), label, taken));
      }
    }
  };

  const boxes = views.map(viewBounds);
  if (opts.kind === "thirdAngle" && boxes.slice(0, 3).every(Boolean)) {
    const [fb, tb, rb] = boxes as Box[];
    const iso = views[3] && boxes[3] ? { view: views[3], box: boxes[3] } : null;
    const [W, H] = size(fb);
    const D = size(tb)[1];
    const dimRoom = opts.dimensions ? DIM_ROOM : 0;
    // 寸法は図の左と下だけに入れる。上下には図の名前の分(8mm)をとる
    const scale = pickScale(W + D, H + D, GAP + dimRoom, GAP + dimRoom + 8);
    const s = scale.s;
    scaleLabel = scale.label;
    // 正面図を左下、平面図をその上、右側面図をその右に置き、全体を真ん中にする
    const groupW = (W + D) * s + GAP;
    const groupH = (H + D) * s + GAP;
    // 等角図もそえるときは、三面図を左に寄せて、右のあいた所に等角図を置く
    const ox = iso ? AREA.x0 + dimRoom + 4 : (AREA.x0 + AREA.x1 - groupW) / 2 + dimRoom / 2;
    const oy = (AREA.y0 + AREA.y1 - groupH) / 2 + dimRoom / 2;
    place(views[0], fb, [ox, oy], s, opts.dimensions, 0);
    place(views[1], tb, [ox, oy + H * s + GAP], s, opts.dimensions, 1);
    place(views[2], rb, [ox + W * s + GAP, oy], s, opts.dimensions, 2);
    labelView(texts, "正面図", [ox + (W * s) / 2, oy - (opts.dimensions ? DIM_ROOM + 5 : 6)]);
    labelView(texts, "平面図", [ox + (W * s) / 2, oy + H * s + GAP + D * s + 3]);
    labelView(texts, "右側面図", [ox + W * s + GAP + (D * s) / 2, oy - (opts.dimensions ? DIM_ROOM + 5 : 6)]);
    if (opts.dimensions) {
      // はば(X)は正面図の下、高さ(Z)は正面図の左、奥行き(Y)は右側面図の下に、
      // 1段目に段・穴・厚さなどの位置を順に(直列寸法)、2段目に全体の大きさを書く
      const lv = featureLevels(views, [fb, tb, rb]);
      const rx = ox + W * s + GAP;
      chainDims(lines, texts, tag, "x", lv[0], (x) => [ox + (x - fb.min[0]) * s, oy], "below");
      chainDims(lines, texts, tag, "z", lv[2], (z) => [ox, oy + (z - fb.min[1]) * s], "left");
      chainDims(lines, texts, tag, "y", lv[1], (y) => [rx + (y - rb.min[0]) * s, oy], "below");
      // 手で足した寸法: 横の長さは図の上(平面図だけは図の下)、たての長さは図の右に、1つずつ 7mm はなしてならべる
      const count = new Map<string, number>();
      for (const d of opts.notes?.added ?? []) {
        const map = maps[d.view];
        const f = frames[d.view];
        if (!map || !f) continue;
        const [pa, pb] = [map(d.a), map(d.b)];
        const value = Math.abs(d.dir === "h" ? d.a[0] - d.b[0] : d.a[1] - d.b[1]);
        if (value < 1e-3) continue;
        const key = `${d.view}${d.dir}`;
        const n = count.get(key) ?? 0;
        count.set(key, n + 1);
        const away = 8 + n * 7;
        if (d.dir === "h") {
          const y = d.view === 1 ? f.min[1] - away : f.max[1] + away;
          tag(d.id, true, () => dimension(lines, texts, pa, pb, y - pa[1], value, "below"));
        } else {
          tag(d.id, true, () => dimension(lines, texts, pa, pb, f.max[0] + away - pa[0], value, "left"));
        }
      }
    }
    if (iso) {
      // あいている所: 右側面図の上(平面図の右)と、右側面図の右
      const rightX = ox + W * s + GAP;
      const regions: Box[] = [
        { min: [rightX, oy + H * s + GAP], max: [AREA.x1, AREA.y1 - 6] },
        { min: [rightX + D * s + GAP, AREA.y0], max: [AREA.x1, AREA.y1 - 6] },
      ];
      const [iw, ih] = size(iso.box);
      let best: { region: Box; c: (typeof SCALES)[number] } | null = null;
      for (const region of regions) {
        const [rw, rh] = size(region);
        const c = SCALES.find((c) => c.s <= s && iw * c.s <= rw && ih * c.s <= rh);
        if (c && (!best || c.s > best.c.s)) best = { region, c };
      }
      if (best && Math.max(iw, ih) * best.c.s >= 25) {
        const [rw, rh] = size(best.region);
        const at: Vec2 = [best.region.min[0] + (rw - iw * best.c.s) / 2, best.region.min[1] + (rh - ih * best.c.s) / 2];
        place(iso.view, iso.box, at, best.c.s);
        labelView(texts, best.c.s === s ? "等角図" : `等角図(${best.c.label})`, [at[0] + (iw * best.c.s) / 2, at[1] + ih * best.c.s + 3]);
      }
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
  return { kind: opts.kind, scaleLabel, lines, texts, dims, snaps };
}

/** 寸法を1つかく関数 draw を、名前 id をつけて呼ぶ */
type Tagger = (id: string, manual: boolean, draw: () => void) => void;

/** 文字のしめる四角(だいたい) */
function textBox(t: SheetText): Box {
  const w = t.text.length * t.size * 0.55 + 1;
  const [x, y] = t.at;
  if (t.rotate) return { min: [x - t.size, y - w / 2], max: [x + 0.5, y + w / 2] };
  const x0 = t.anchor === "start" ? x : t.anchor === "end" ? x - w : x - w / 2;
  return { min: [x0, y - 0.5], max: [x0 + w, y + t.size] };
}

const unionBox = (a: Box, b: Box): Box => ({ min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])], max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])] });

function labelView(texts: SheetText[], text: string, at: Vec2) {
  texts.push({ at, text, size: 3.5, anchor: "middle" });
}

/**
 * 寸法をかく(寸法補助線・矢印つきの寸法線・数字)。
 * a→b は図の上の2点、offset は図からはなす距離(mm)、value は実物の長さ。
 */
function dimension(lines: SheetLine[], texts: SheetText[], a: Vec2, b: Vec2, offset: number, value: number, side: "below" | "left", textAt?: number) {
  const text = formatMm(value);
  // t は寸法線にそった向き、o は図からはなれる向きの座標。below なら t = x、left なら t = y
  const horiz = side === "below";
  const P = (t: number, o: number): Vec2 => (horiz ? [t, o] : [o, t]);
  const dir = (d: number): Vec2 => (horiz ? [d, 0] : [0, d]);
  // 寸法補助線は、それぞれの点から引く(手で足した寸法は、2つの点の高さがちがうことがある)
  const ends = [a, b].map((p) => (horiz ? { t: p[0], base: p[1] } : { t: p[1], base: p[0] })).sort((p, q) => p.t - q.t);
  const o = ends.find((e) => e.t === (horiz ? a[0] : a[1]))!.base + offset;
  const [lo, hi] = [ends[0].t, ends[1].t];
  // 寸法補助線は、図から 1mm はなして始め、寸法線より 2mm 先まで出す(JIS)
  for (const e of ends) {
    const sg = Math.sign(o - e.base) || -1;
    lines.push({ style: "dim", points: [P(e.t, e.base + sg), P(e.t, o + sg * 2)] });
  }
  const len = hi - lo;
  if (len >= 7) {
    lines.push({ style: "dim", points: [P(lo, o), P(hi, o)] });
    lines.push(arrow(P(lo, o), dir(1)), arrow(P(hi, o), dir(-1)));
  } else {
    // せまい所は、矢印を外側から内に向けてかく
    lines.push({ style: "dim", points: [P(lo - 4, o), P(hi + 4, o)] });
    lines.push(arrow(P(lo, o), dir(-1)), arrow(P(hi, o), dir(1)));
  }
  // 数字が寸法線の間に入らないときは、外(大きい方の先)に書く
  const t = textAt ?? (fitsInside(text, len) ? (lo + hi) / 2 : hi + 4.5 + textWidth(text) / 2);
  if (horiz) texts.push({ at: [t, o + 1.2], text, size: 3.5, anchor: "middle" });
  else texts.push({ at: [o - 1.2, t], text, size: 3.5, anchor: "middle", rotate: 90 });
}

/** 寸法の数字の幅(mm、だいたい) */
const textWidth = (text: string) => text.length * 1.9 + 1;
/** 数字が寸法線の間に入るか */
const fitsInside = (text: string, len: number) => len >= textWidth(text) + 1;

/** 先が tip にあり、dir の向きに開く、ぬりつぶした矢印(長さ 3mm・開き 約 20°) */
function arrow(tip: Vec2, dir: Vec2): SheetLine {
  const [dx, dy] = dir;
  const len = 3;
  const half = 0.55;
  const base: Vec2 = [tip[0] + dx * len, tip[1] + dy * len];
  return {
    style: "arrow",
    points: [tip, [base[0] - dy * half, base[1] + dx * half], [base[0] + dy * half, base[1] - dx * half], tip],
  };
}

/** 実物の軸(0 = X はば、1 = Y 奥行き、2 = Z 高さ)。第三角法の図の 紙の横・縦 がどの軸か */
const VIEW_AXES: [number, number][] = [
  [0, 2], // 正面図
  [0, 1], // 平面図
  [1, 2], // 右側面図
];

/**
 * 寸法を入れる位置(実物の座標)を軸ごとに集める。
 * 段や厚さ(図に平行な辺)、穴の中心、大きな円弧(取っ手など)の中心を入れる。
 * 直径で分かる位置(穴のふち)は入れない。全体のはし(いちばん外)はかならず入れる。
 */
export function featureLevels(views: ProjectedView[], boxes: Box[]): number[][] {
  const found: number[][] = [[], [], []];
  const byDiameter: number[][] = [[], [], []];
  const centersOf: number[][] = [[], [], []];
  views.slice(0, 3).forEach((v, i) => {
    const [ax, ay] = VIEW_AXES[i];
    for (const [a, b] of v.segments ?? []) {
      if (Math.abs(a[0] - b[0]) < 1e-3) found[ax].push(a[0]);
      if (Math.abs(a[1] - b[1]) < 1e-3) found[ay].push(a[1]);
    }
    for (const c of v.circles) {
      found[ax].push(c.c[0]);
      found[ay].push(c.c[1]);
      centersOf[ax].push(c.c[0]);
      centersOf[ay].push(c.c[1]);
      byDiameter[ax].push(c.c[0] - c.r, c.c[0] + c.r);
      byDiameter[ay].push(c.c[1] - c.r, c.c[1] + c.r);
    }
    // 半円より大きく開いた円弧は、中心の位置も寸法にする。
    // 角の丸み(小さな円弧)の中心は、丸みと平らな所の境目の線と同じ位置なので、寸法にしない(R で分かる)
    for (const a of v.arcs ?? []) {
      const target = a.span < 2.5 ? byDiameter : found;
      target[ax].push(a.c[0]);
      target[ay].push(a.c[1]);
    }
  });
  const [fb, , rb] = boxes;
  const range: [number, number][] = [
    [fb.min[0], fb.max[0]],
    [rb.min[0], rb.max[0]],
    [fb.min[1], fb.max[1]],
  ];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const isCenter = (axis: number, v: number) => centersOf[axis].some((c) => near(c, v));
  return range.map(([lo, hi], axis) => {
    // 穴や円の中心は、角の丸みの中心と同じ位置でも かならず入れる
    const inner = found[axis].filter((v) => v > lo + 0.05 && v < hi - 0.05 && (!byDiameter[axis].some((d) => near(d, v)) || isCenter(axis, v)));
    const out = [lo];
    for (const v of inner.sort((a, b) => a - b)) if (!near(v, out[out.length - 1])) out.push(v);
    out.push(hi);
    return out;
  });
}

/**
 * 寸法を順につないでかく(直列寸法)。1段目に区切りごとの寸法、2段目に全体の寸法。
 * 区切りが1つだけ(全体だけ)なら1段目に全体を書く。区切りが多すぎるときは全体だけにする。
 */
function chainDims(lines: SheetLine[], texts: SheetText[], tag: Tagger, axis: string, levels: number[], at: (v: number) => Vec2, side: "below" | "left") {
  const id = (row: number, a: number, b: number) => `${axis}${row}:${formatMm(a)}~${formatMm(b)}`;
  const first = levels[0];
  const last = levels[levels.length - 1];
  const parts = levels.length - 1;
  if (parts >= 2 && parts <= 8) {
    // 数字の置き場所を決める。
    // 間に入らない数字(せまい所)を先に、右(上)か左(下)の外の、ほかと重ならない所に置く。
    // そのあと間に入る数字を真ん中に置き、せまい所の数字と重なるなら、自分の寸法線の中でずらす
    const t = (v: number) => at(v)[side === "below" ? 0 : 1];
    const spans = levels.slice(1).map((v, i) => ({ lo: t(levels[i]), hi: t(v), text: formatMm(v - levels[i]) }));
    const placed: [number, number][] = [];
    const clear = (c: number, w: number) => placed.every(([a, b]) => c + w / 2 + 0.5 < a || c - w / 2 - 0.5 > b);
    const pos: number[] = spans.map(() => NaN);
    spans.forEach((sp, i) => {
      if (fitsInside(sp.text, sp.hi - sp.lo)) return;
      const w = textWidth(sp.text);
      const outHi = [sp.hi + 4.5 + w / 2, sp.hi + 9 + w / 2];
      const outLo = [sp.lo - 4.5 - w / 2, sp.lo - 9 - w / 2];
      // いちばん はしの区切りは、図の外側に書く
      const cands = i === 0 ? [outLo[0], outHi[0], outLo[1], outHi[1]] : [outHi[0], outLo[0], outHi[1], outLo[1]];
      pos[i] = cands.find((c) => clear(c, w)) ?? cands[0];
      placed.push([pos[i] - w / 2, pos[i] + w / 2]);
    });
    spans.forEach((sp, i) => {
      if (!Number.isNaN(pos[i])) return;
      const w = textWidth(sp.text);
      const [min, max] = [sp.lo + w / 2 + 0.5, sp.hi - w / 2 - 0.5];
      const cands = [(sp.lo + sp.hi) / 2, ...placed.flatMap(([a, b]) => [b + 0.6 + w / 2, a - 0.6 - w / 2])].filter((c) => c >= min && c <= max);
      pos[i] = cands.find((c) => clear(c, w)) ?? (sp.lo + sp.hi) / 2;
      placed.push([pos[i] - w / 2, pos[i] + w / 2]);
    });
    for (let i = 0; i < parts; i++) tag(id(1, levels[i], levels[i + 1]), false, () => dimension(lines, texts, at(levels[i]), at(levels[i + 1]), DIM_ROW[0], levels[i + 1] - levels[i], side, pos[i]));
    tag(id(2, first, last), false, () => dimension(lines, texts, at(first), at(last), DIM_ROW[1], last - first, side));
  } else {
    tag(id(1, first, last), false, () => dimension(lines, texts, at(first), at(last), DIM_ROW[0], last - first, side));
  }
}

/**
 * 円弧の半径(「R2」)を、中心から弧のまん中へ向かう向きに引き出してかく。
 * ほかの半径の文字と重なるときは、折れる所を上下にずらす。
 */
function radius(lines: SheetLine[], texts: SheetText[], c: Vec2, mid: Vec2, label: string, taken: Box[]) {
  const len = Math.hypot(mid[0] - c[0], mid[1] - c[1]) || 1;
  const u: Vec2 = [(mid[0] - c[0]) / len, (mid[1] - c[1]) / len];
  const sx = u[0] >= 0 ? 1 : -1;
  const w = label.length * 2 + 1;
  const boxAt = (e: Vec2): Box => ({ min: [sx > 0 ? e[0] : e[0] - w, e[1] - 0.5], max: [sx > 0 ? e[0] + w : e[0], e[1] + 4.5] });
  const hits = (b: Box) => taken.some((t) => b.min[0] < t.max[0] && b.max[0] > t.min[0] && b.min[1] < t.max[1] && b.max[1] > t.min[1]);
  let elbow: Vec2 = [mid[0] + u[0] * 6, mid[1] + u[1] * 6];
  for (const dy of [0, 6, -6, 12, -12]) {
    const e: Vec2 = [mid[0] + u[0] * 6, mid[1] + u[1] * 6 + dy];
    if (!hits(boxAt(e))) {
      elbow = e;
      break;
    }
  }
  taken.push(boxAt(elbow));
  const end: Vec2 = [elbow[0] + sx * w, elbow[1]];
  lines.push({ style: "dim", points: [mid, elbow, end] });
  // 矢印は弧に当たる所。引き出し線の向きに開く
  const ll = Math.hypot(elbow[0] - mid[0], elbow[1] - mid[1]) || 1;
  lines.push(arrow(mid, [(elbow[0] - mid[0]) / ll, (elbow[1] - mid[1]) / ll]));
  texts.push({ at: [elbow[0] + sx * 0.5, elbow[1] + 1], text: label, size: 3.2, anchor: sx > 0 ? "start" : "end" });
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
  lines.push(arrow(edge, [sx * Math.SQRT1_2, sy * Math.SQRT1_2]));
  texts.push({ at: [elbow[0] + sx * 0.5, elbow[1] + 1], text, size: 3.2, anchor: sx > 0 ? "start" : "end" });
}

/** わく(輪郭線)・中心マーク・表題欄 */
function frameAndTitle(lines: SheetLine[], texts: SheetText[], opts: SheetOptions, scaleLabel: string) {
  const { x0, y0, x1, y1 } = FRAME;
  lines.push({ style: "frame", points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] });
  // 中心マーク: 紙のはしから輪郭線の内側 5mm まで、4辺のまん中に引く(JIS)
  const mx = PAPER.width / 2;
  const my = PAPER.height / 2;
  lines.push(
    { style: "frame", points: [[mx, 0], [mx, y0 + 5]] },
    { style: "frame", points: [[mx, PAPER.height], [mx, y1 - 5]] },
    { style: "frame", points: [[0, my], [x0 + 5, my]] },
    { style: "frame", points: [[PAPER.width, my], [x1 - 5, my]] },
  );

  // 表題欄(右下)
  //  ┌────┬──────────────────────────┐
  //  │図名│ 作品名                    │
  //  ├────┼───────────┬──────────────┤
  //  │尺度│ 1:2        │ 投影法       │
  //  ├────┼───────────┤  (記号)      │
  //  │材料│            │              │
  //  ├────┼───────────┼──────────────┤
  //  │氏名│ 名前       │ 日付         │
  //  └────┴───────────┴──────────────┘
  const tx = x1 - TITLE.w;
  const ty = y0 + TITLE.h;
  const row = TITLE.h / 4;
  const labelW = 16;
  const rightW = 42;
  const rx = x1 - rightW;
  lines.push({ style: "frame", points: [[tx, y0], [tx, ty], [x1, ty]] });
  for (let i = 1; i < 4; i++) {
    const y = y0 + row * i;
    // 投影法の欄(2段目と3段目)は横線で切らない
    lines.push({ style: "dim", points: [[tx, y], [i === 2 ? rx : x1, y]] });
  }
  lines.push({ style: "dim", points: [[tx + labelW, y0], [tx + labelW, ty]] });
  lines.push({ style: "dim", points: [[rx, y0], [rx, ty - row]] });

  const rowY = (i: number) => ty - row * i + 2.6; // i 段目(上から 1, 2, 3, 4)の文字の高さ
  const label = (i: number, text: string) => texts.push({ at: [tx + labelW / 2, rowY(i)], text, size: 2.8, anchor: "middle" });
  const value = (i: number, text: string, x = tx + labelW + 2.5, size = 3.5) => texts.push({ at: [x, rowY(i)], text, size, anchor: "start" });
  label(1, "図名");
  value(1, opts.title || "(なし)", undefined, 4);
  label(2, "尺度");
  value(2, scaleLabel);
  label(3, "材料");
  if (opts.material) value(3, opts.material);
  label(4, "氏名");
  value(4, opts.author || "");
  texts.push({ at: [rx + 2.5, rowY(4)], text: `日付  ${opts.date ?? ""}`, size: 2.8, anchor: "start" });

  // 投影法の欄: 第三角法なら記号をかく。等角図・キャビネット図は図の種類を書く
  const cellTop = ty - row;
  const cellCx = rx + rightW / 2;
  if (opts.kind === "thirdAngle") {
    texts.push({ at: [cellCx, cellTop - 3.6], text: "第三角法", size: 2.8, anchor: "middle" });
    thirdAngleSymbol(lines, [cellCx, cellTop - row - 2.2]);
  } else {
    texts.push({ at: [cellCx, cellTop - row + 0.6], text: KIND_LABELS[opts.kind], size: 3.2, anchor: "middle" });
  }
}

/**
 * 第三角法の記号(JIS B 0001): 円すい台を横から見た図(台形)と、その右に右から見た図(2つの円)。
 * 右から見るので、細い方が右になる。
 */
function thirdAngleSymbol(lines: SheetLine[], c: Vec2) {
  const [cx, cy] = c;
  const big = 3.2;
  const small = 1.6;
  const left = cx - 12;
  const right = cx - 2;
  lines.push({ style: "visible", points: [[left, cy - big], [right, cy - small], [right, cy + small], [left, cy + big], [left, cy - big]] });
  const ccx = cx + 7;
  lines.push({ style: "visible", points: circlePoints([ccx, cy], big) }, { style: "visible", points: circlePoints([ccx, cy], small) });
  lines.push({ style: "center", points: [[left - 1.5, cy], [right + 1.5, cy]] }, { style: "center", points: [[ccx - big - 1.5, cy], [ccx + big + 1.5, cy]] }, { style: "center", points: [[ccx, cy - big - 1.5], [ccx, cy + big + 1.5]] });
}

function circlePoints(c: Vec2, r: number, n = 36): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos((i / n) * Math.PI * 2), c[1] + r * Math.sin((i / n) * Math.PI * 2)] as Vec2);
}

/** 寸法の数字。整数ならそのまま、そうでなければ小数1けたまで */
export function formatMm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---- SVG ----

// 線の太さは JIS の 太線 0.5・細線 0.25 にそろえる(わくは 0.7)
const SVG_STYLE: Record<LineStyle, string> = {
  visible: 'stroke="#000" stroke-width="0.5"',
  hidden: 'stroke="#000" stroke-width="0.35" stroke-dasharray="3 1"',
  dim: 'stroke="#000" stroke-width="0.25"',
  frame: 'stroke="#000" stroke-width="0.7"',
  center: 'stroke="#000" stroke-width="0.25" stroke-dasharray="8 1.2 1.2 1.2"',
  arrow: 'stroke="#000" stroke-width="0.1" fill="#000"',
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
    const tag = l.style === "arrow" ? "polygon" : "polyline";
    out.push(`<${tag} ${SVG_STYLE[l.style]} points="${l.points.map(([x, y]) => `${n2(x)},${n2(H - y)}`).join(" ")}"/>`);
  }
  out.push("</g>", '<g fill="#000" font-family="\'BIZ UDPGothic\', \'BIZ UDPゴシック\', \'Hiragino Sans\', \'Noto Sans JP\', sans-serif">');
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
  arrow: { name: "DIMENSION", ltype: "CONTINUOUS", color: 3 },
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
