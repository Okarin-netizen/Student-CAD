import { ORIGIN_ID, type Id, type SketchEntity, type Vec2 } from "../../doc/types";

export interface Viewport {
  /** 画面の中心に来るスケッチ上の点 */
  cx: number;
  cy: number;
  /** 1mm が何ピクセルか */
  scale: number;
  width: number;
  height: number;
}

export const toScreen = (v: Viewport, [x, y]: Vec2): Vec2 => [(x - v.cx) * v.scale + v.width / 2, v.height / 2 - (y - v.cy) * v.scale];
export const toWorld = (v: Viewport, [sx, sy]: Vec2): Vec2 => [(sx - v.width / 2) / v.scale + v.cx, (v.height / 2 - sy) / v.scale + v.cy];

/** 画面の拡大率に合わせたマス目の間隔(mm) */
export function gridStep(scale: number): number {
  const target = 24 / scale; // 1マスがだいたい 24px になるように
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (s >= target) return s;
  return 200;
}

export function positions(entities: SketchEntity[]): Map<Id, Vec2> {
  const m = new Map<Id, Vec2>([[ORIGIN_ID, [0, 0]]]);
  for (const e of entities) if (e.type === "point") m.set(e.id, [e.x, e.y]);
  return m;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** 円弧の上にあるか(角度が範囲内か)も見て、円弧までの距離を返す */
export function distToArc(p: Vec2, c: Vec2, r: number, a0: number, a1: number): number {
  const ang = Math.atan2(p[1] - c[1], p[0] - c[0]);
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  let rel = ang - a0;
  while (rel < 0) rel += Math.PI * 2;
  if (rel <= sweep) return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r);
  const s: Vec2 = [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)];
  const e: Vec2 = [c[0] + r * Math.cos(a0 + sweep), c[1] + r * Math.sin(a0 + sweep)];
  return Math.min(Math.hypot(p[0] - s[0], p[1] - s[1]), Math.hypot(p[0] - e[0], p[1] - e[1]));
}

/** SVG の円弧パス(スクリーン座標) */
export function arcPath(v: Viewport, c: Vec2, r: number, a0: number, a1: number): string {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const s = toScreen(v, [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)]);
  const e = toScreen(v, [c[0] + r * Math.cos(a0 + sweep), c[1] + r * Math.sin(a0 + sweep)]);
  const large = sweep > Math.PI ? 1 : 0;
  const rs = r * v.scale;
  // スクリーンは y が下向きなので、反時計回り(数学)は sweep-flag 0
  return `M${s[0]} ${s[1]}A${rs} ${rs} 0 ${large} 0 ${e[0]} ${e[1]}`;
}

export function bounds(entities: SketchEntity[]): { min: Vec2; max: Vec2 } | null {
  const pos = positions(entities);
  let min: Vec2 = [Infinity, Infinity];
  let max: Vec2 = [-Infinity, -Infinity];
  const add = ([x, y]: Vec2) => {
    min = [Math.min(min[0], x), Math.min(min[1], y)];
    max = [Math.max(max[0], x), Math.max(max[1], y)];
  };
  for (const e of entities) {
    if (e.type === "point") add([e.x, e.y]);
    if (e.type === "circle" || e.type === "arc") {
      const c = pos.get(e.c)!;
      add([c[0] - e.r, c[1] - e.r]);
      add([c[0] + e.r, c[1] + e.r]);
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

export const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? 1 : 2);
};
