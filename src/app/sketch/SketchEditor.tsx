// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GcsWrapper } from "@salusoft89/planegcs";
import { newId } from "../../doc/ids";
import {
  ORIGIN_ID,
  isDimension,
  type DimensionConstraint,
  type Id,
  type LineEntity,
  type SketchConstraint,
  type SketchEntity,
  type SketchFeature,
  type Vec2,
} from "../../doc/types";
import {
  addArc,
  addCircle,
  addConstraint,
  addLine,
  addPolygon,
  addRectangle,
  addText,
  deleteItems,
  isCurve,
  drag,
  setDimension,
  settle,
  toggleConstruction,
  updateText,
  type PointSpec,
  type SketchData,
} from "../../sketch/edit";
import { measureAngle, measureLength, solveSketch } from "../../sketch/solver";
import { findProfiles } from "../../sketch/profiles";
import { term, type TermKey } from "../terms";
import { NumberPad, type PadVariable } from "../NumberPad";
import { referenceCorners } from "./references";
import { arcPath, bounds, distToArc, distToSegment, fmt, gridStep, positions, textBox, toScreen, toWorld, type Viewport } from "./geometry";
import { TextDialog } from "./TextDialog";
import { Icon, type IconName } from "../Icon";

export type Tool = "select" | "line" | "rect" | "circle" | "arc" | "polygon" | "text" | "dimension";

interface Props {
  sketch: SketchFeature;
  gcs: GcsWrapper;
  pro: boolean;
  /** 下がき: スケッチ平面の上にある立体の輪郭(x, y の線分の並び) */
  references?: Float32Array;
  onEdit: (next: SketchData, recordFrom?: SketchData) => void;
  onPreview: (next: SketchData) => void;
  onMessage: (text: string, kind?: "info" | "error") => void;
  /** 寸法に使える変数 */
  variables?: PadVariable[];
}

type Hit =
  | { kind: "point"; id: Id }
  | { kind: "curve"; id: Id }
  | { kind: "constraint"; id: Id };

interface Snap {
  spec: PointSpec;
  xy: Vec2;
  /** 既存の点に吸い付いたか */
  snapped: boolean;
}

interface Press {
  pointerId: number;
  start: Vec2; // スクリーン座標
  last: Vec2;
  moved: boolean;
  hit: Hit | null;
  /** ドラッグを始める前のスケッチ(もどす用) */
  before: SketchData;
  vpStart: Viewport;
}

interface Label {
  id: Id;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** id と値をまだ決めていない寸法 */
type NewDimension = DimensionConstraint extends infer C ? (C extends DimensionConstraint ? Omit<C, "value" | "id"> : never) : never;

const HIT_PX = 22;
const MOVE_PX = 6;
/** きまりの記号(水平・垂直など)の大きさと、線からのはなれ方(px)。指でさわれる大きさにする(2026-11-10) */
const GLYPH_SIZE = 28;
const GLYPH_GAP = 24;
/** きまりの記号をえらんだときに出す、意味の説明 */
const CONSTRAINT_MEANING: Partial<Record<SketchConstraint["type"], string>> = {
  horizontal: "この線はまっすぐ横",
  vertical: "この線はまっすぐ縦",
  parallel: "2本の線は同じ向き",
  perpendicular: "2本の線は直角に交わる",
  equal: "2つは同じ長さ(同じ大きさ)",
};

const TOOLS: { tool: Tool; label: string; icon: IconName; hint: string }[] = [
  { tool: "select", label: "えらぶ", icon: "select", hint: "点や線をタップしてえらびます。点はドラッグで動かせます。何もないところをドラッグすると画面が動きます" },
  { tool: "line", label: "線", icon: "line", hint: "点をタップしてつなげていきます。始めの点をタップすると形が閉じます" },
  { tool: "rect", label: "長方形", icon: "rect", hint: "角をタップしてから、反対の角をタップします" },
  { tool: "circle", label: "円", icon: "circle", hint: "中心をタップしてから、大きさを決める点をタップします" },
  { tool: "arc", label: "円弧", icon: "arc", hint: "中心 → 始まり → 終わりの順にタップします(左回りにかけます)" },
  { tool: "polygon", label: "多角形", icon: "polygon", hint: "中心をタップしてから、角の1つをタップします" },
  { tool: "text", label: "文字", icon: "text", hint: "文字を置きたいところ(文字の左下)をタップします。名札は、板の上の面にかいてから押し出します" },
  { tool: "dimension", label: "寸法", icon: "dimension", hint: "線をタップすると長さ、円をタップすると直径を入れられます。点を2つタップすると距離です" },
];

/** 1つ目の点を置いたあとの案内 */
function nextStepHint(tool: Tool, placed: number): string | null {
  const slide = "(指を置いたまま動かすと、大きさを見ながら決められます)";
  if (tool === "line") return `次の点をタップ${slide}`;
  if (tool === "rect") return `反対の角をタップ${slide}`;
  if (tool === "circle" || tool === "polygon") return `大きさを決める点をタップ${slide}`;
  if (tool === "arc") return placed === 1 ? "円弧の始まりの点をタップ" : "円弧の終わりの点をタップ";
  return null;
}

export function SketchEditor({ sketch, gcs, pro, references, onEdit, onPreview, onMessage, variables = [] }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vp, setVp] = useState<Viewport>({ cx: 30, cy: 20, scale: 6, width: 800, height: 600 });
  const [tool, setTool] = useState<Tool>("line");
  const [selection, setSelection] = useState<Id[]>([]);
  const [pending, setPending] = useState<Snap[]>([]);
  const [cursor, setCursor] = useState<Snap | null>(null);
  const [sides, setSides] = useState(6);
  const [dimPick, setDimPick] = useState<Hit[]>([]);
  /** 道具の案内のかわりに出す、いまの操作の案内 */
  const [guide, setGuide] = useState<string | null>(null);
  const lastPointer = useRef<string>("mouse");
  const [numpad, setNumpad] = useState<{ title: string; unit: string; initial: number; initialExpr?: string; allowZero?: boolean; submit: (v: number, expr?: string) => void } | null>(null);
  /** 文字を入れる・なおすダイアログ */
  const [textDialog, setTextDialog] = useState<{ title: string; text: string; size: number; submit: (text: string, size: number) => void } | null>(null);
  const pressRef = useRef<Press | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const gesture = useRef<{ dist: number; mid: Vec2; vp: Viewport } | null>(null);
  const labelsRef = useRef<Label[]>([]);
  const fittedRef = useRef(false);

  const data: SketchData = { entities: sketch.entities, constraints: sketch.constraints };
  const pos = useMemo(() => positions(sketch.entities), [sketch.entities]);
  const ents = useMemo(() => new Map(sketch.entities.map((e) => [e.id, e])), [sketch.entities]);
  const status = useMemo(() => solveSketch(gcs, data), [sketch.entities, sketch.constraints]); // eslint-disable-line react-hooks/exhaustive-deps
  const profiles = useMemo(() => findProfiles(data), [sketch.entities, sketch.constraints]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = references ?? NO_REFS;
  const refCorners = useMemo(() => referenceCorners(refs), [refs]);
  /** 下がき(かいている面)の範囲。文字が面からはみ出していないかを見るのに使う */
  const refBox = useMemo(() => {
    if (refs.length < 4) return null;
    let min: Vec2 = [Infinity, Infinity];
    let max: Vec2 = [-Infinity, -Infinity];
    for (let i = 0; i + 1 < refs.length; i += 2) {
      min = [Math.min(min[0], refs[i]), Math.min(min[1], refs[i + 1])];
      max = [Math.max(max[0], refs[i]), Math.max(max[1], refs[i + 1])];
    }
    return { min, max };
  }, [refs]);
  const defined = status.ok && status.dof === 0 && sketch.entities.length > 0;

  // 画面の大きさに合わせる
  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setVp((v) => ({ ...v, width: r.width, height: r.height }));
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // 開いたときに全体が見えるようにする
  useEffect(() => {
    if (fittedRef.current || vp.width < 50) return;
    fittedRef.current = true;
    fit();
  }, [vp.width]); // eslint-disable-line react-hooks/exhaustive-deps

  // 道具を変えたら途中の操作は捨てる
  useEffect(() => {
    setPending([]);
    setDimPick([]);
    setGuide(null);
    if (tool !== "select") setSelection([]);
  }, [tool]);

  // 下がきが後から届いたら(面にかき始めたとき)、それが見えるように合わせ直す
  const refFitted = useRef(false);
  useEffect(() => {
    if (refFitted.current || refs.length === 0 || vp.width < 50) return;
    refFitted.current = true;
    fit();
  }, [refs, vp.width]); // eslint-disable-line react-hooks/exhaustive-deps

  // 指で1つ目の点を置いたら、仮の大きさで見本を出す(指を離すとカーソルがないので)
  useEffect(() => {
    if (lastPointer.current === "mouse" || pending.length === 0) return;
    const last = pending.at(-1)!.xy;
    // 画面で 150px くらい、マス目にそろえた大きさ
    const g = gridStep(vp.scale);
    const d = Math.max(g, Math.round(150 / vp.scale / g) * g);
    const ghost: Vec2 = tool === "rect" ? [last[0] + d, last[1] - Math.max(g, Math.round((d * 0.6) / g) * g)] : tool === "arc" && pending.length === 2 ? rotate(pending[0].xy, pending[1].xy, Math.PI / 2) : [last[0] + d, last[1]];
    setCursor({ spec: { xy: ghost }, xy: ghost, snapped: false });
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = () => {
    const b = bounds(sketch.entities);
    let min: Vec2 = b ? b.min : refs.length ? [Infinity, Infinity] : [0, 0];
    let max: Vec2 = b ? b.max : refs.length ? [-Infinity, -Infinity] : [60, 40];
    for (let i = 0; i + 1 < refs.length; i += 2) {
      min = [Math.min(min[0], refs[i]), Math.min(min[1], refs[i + 1])];
      max = [Math.max(max[0], refs[i]), Math.max(max[1], refs[i + 1])];
    }
    const w = Math.max(max[0] - min[0], 20);
    const h = Math.max(max[1] - min[1], 20);
    setVp((v) => ({
      ...v,
      cx: (min[0] + max[0]) / 2,
      cy: (min[1] + max[1]) / 2,
      scale: Math.min(v.width / (w * 1.6), v.height / (h * 1.6)),
    }));
  };

  // ---- 位置の計算 ----

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const snapAt = (screen: Vec2, from?: Snap): Snap => {
    // 1. 既存の点(原点を含む)
    let best: { id: Id; d: number } | null = null;
    for (const [id, p] of pos) {
      const s = toScreen(vp, p);
      const d = Math.hypot(s[0] - screen[0], s[1] - screen[1]);
      if (d < HIT_PX && (!best || d < best.d)) best = { id, d };
    }
    if (best) return { spec: { id: best.id }, xy: pos.get(best.id)!, snapped: true };
    // 2. 下がき(立体の輪郭)の角、つぎに輪郭の線の上
    let corner: { p: Vec2; d: number } | null = null;
    for (const p of refCorners) {
      const s = toScreen(vp, p);
      const d = Math.hypot(s[0] - screen[0], s[1] - screen[1]);
      if (d < HIT_PX && (!corner || d < corner.d)) corner = { p, d };
    }
    if (corner) return { spec: { xy: corner.p }, xy: corner.p, snapped: true };
    const w = toWorld(vp, screen);
    let onRef: { p: Vec2; d: number } | null = null;
    for (let i = 0; i + 3 < refs.length; i += 4) {
      const a: Vec2 = [refs[i], refs[i + 1]];
      const b: Vec2 = [refs[i + 2], refs[i + 3]];
      const d = distToSegment(w, a, b) * vp.scale;
      if (d < HIT_PX / 2 && (!onRef || d < onRef.d)) onRef = { p: closestOnSegment(w, a, b), d };
    }
    // 3. マス目に吸い付ける。線の途中なら、水平・垂直にもそろえる
    const step = gridStep(vp.scale) / 2;
    let [x, y] = w;
    x = Math.round(x / step) * step;
    y = Math.round(y / step) * step;
    if (from) {
      const fs = toScreen(vp, from.xy);
      if (Math.abs(fs[1] - screen[1]) < 10) y = from.xy[1];
      else if (Math.abs(fs[0] - screen[0]) < 10) x = from.xy[0];
    }
    // 輪郭の線とマス目の点の、タップした所に近いほうを使う。
    // (輪郭の線を先にすると、壁の厚みの中など、線のすぐそばのマス目に点を置けなかった)
    const gs = toScreen(vp, [x, y]);
    if (onRef && onRef.d < Math.hypot(gs[0] - screen[0], gs[1] - screen[1])) return { spec: { xy: onRef.p }, xy: onRef.p, snapped: false };
    return { spec: { xy: [x, y] }, xy: [x, y], snapped: false };
  };

  const hitTest = (screen: Vec2): Hit | null => {
    for (const l of labelsRef.current) {
      if (Math.abs(screen[0] - l.x) < l.w / 2 + 6 && Math.abs(screen[1] - l.y) < l.h / 2 + 6) return { kind: "constraint", id: l.id };
    }
    let best: { hit: Hit; d: number } | null = null;
    const consider = (hit: Hit, d: number, limit: number) => {
      if (d < limit && (!best || d < best.d)) best = { hit, d };
    };
    for (const [id, p] of pos) {
      const s = toScreen(vp, p);
      consider({ kind: "point", id }, Math.hypot(s[0] - screen[0], s[1] - screen[1]) - 4, HIT_PX);
    }
    if (best) return (best as { hit: Hit }).hit;
    const w = toWorld(vp, screen);
    const tol = HIT_PX / vp.scale;
    // 文字は、文字のある四角の中をタップしたら当たり
    for (const e of sketch.entities) {
      if (e.type !== "text" || !pos.has(e.p)) continue;
      const b = textBox(e, pos.get(e.p)!);
      if (w[0] >= b.min[0] - tol / 2 && w[0] <= b.max[0] + tol / 2 && w[1] >= b.min[1] - tol / 2 && w[1] <= b.max[1] + tol / 2) return { kind: "curve", id: e.id };
    }
    for (const e of sketch.entities) {
      if (e.type === "line") consider({ kind: "curve", id: e.id }, distToSegment(w, pos.get(e.p1)!, pos.get(e.p2)!), tol);
      if (e.type === "circle") consider({ kind: "curve", id: e.id }, Math.abs(Math.hypot(w[0] - pos.get(e.c)![0], w[1] - pos.get(e.c)![1]) - e.r), tol);
      if (e.type === "arc") consider({ kind: "curve", id: e.id }, distToArc(w, pos.get(e.c)!, e.r, e.a0, e.a1), tol);
    }
    return best ? (best as { hit: Hit }).hit : null;
  };

  // ---- 図形を足す ----

  const commit = (next: SketchData, msgOnFail = true) => {
    const r = settle(gcs, next);
    if (!r.ok && msgOnFail) onMessage(r.message!, "error");
    onEdit(r.ok ? r.sketch : next, data);
  };

  /** 2つのタップが画面の上でほとんど同じ所(4px より近い)か */
  const tooClose = (a: Snap, b: Snap) => dist(a.xy, b.xy) * vp.scale < 4;

  const placePoint = (snap: Snap, wasDrag: Snap | null) => {
    const pts = wasDrag && pending.length === 0 ? [wasDrag, snap] : [...pending, snap];
    switch (tool) {
      case "line": {
        if (pts.length < 2) return setPending(pts);
        const [a, b] = pts.slice(-2);
        if (dist(a.xy, b.xy) * vp.scale < 4) return setPending([a]);
        const { sketch: next, endId } = addLine(data, a.spec, b.spec);
        commit(next);
        // 既存の点で終わったら(形が閉じたら)そこで終わり。そうでなければ続けて引ける
        setPending(b.snapped ? [] : [{ spec: { id: endId }, xy: b.xy, snapped: true }]);
        return;
      }
      case "rect": {
        if (pts.length < 2) return setPending(pts);
        const [a, b] = pts;
        if (Math.abs(a.xy[0] - b.xy[0]) * vp.scale < 4 || Math.abs(a.xy[1] - b.xy[1]) * vp.scale < 4) return setPending([a]);
        commit(addRectangle(data, a.spec, b.spec));
        return setPending([]);
      }
      case "circle": {
        if (pts.length < 2) return setPending(pts);
        // 中心と同じ所をもう一度タップしたときは、大きさ0の円を作らずに、次のタップを待つ
        if (tooClose(pts[0], pts[1])) return setPending([pts[0]]);
        commit(addCircle(data, pts[0].spec, dist(pts[0].xy, pts[1].xy)));
        return setPending([]);
      }
      case "polygon": {
        if (pts.length < 2) return setPending(pts);
        if (tooClose(pts[0], pts[1])) return setPending([pts[0]]);
        commit(addPolygon(data, pts[0].spec, pts[1].xy, sides));
        return setPending([]);
      }
      case "arc": {
        if (pts.length < 3) return setPending(pts);
        // 始まり・終わりが中心と同じ所だと、半径や向きが決まらない
        if (tooClose(pts[0], pts[1])) return setPending([pts[0]]);
        if (tooClose(pts[0], pts[2])) return setPending(pts.slice(0, 2));
        commit(addArc(data, pts[0].spec, pts[1].spec, pts[2].xy));
        return setPending([]);
      }
    }
  };

  // ---- 文字 ----

  const askText = (title: string, text: string, size: number, submit: (text: string, size: number) => void) => {
    setTextDialog({
      title,
      text,
      size,
      submit: (t, sz) => {
        submit(t, sz);
        setTextDialog(null);
      },
    });
  };

  /** 文字が下がきの面からはみ出しているか */
  const overflows = (e: Extract<SketchEntity, { type: "text" }>, entities = sketch.entities) => {
    if (!refBox) return false;
    const at = positions(entities).get(e.p);
    if (!at) return false;
    const b = textBox(e, at);
    const eps = 1e-6;
    return b.min[0] < refBox.min[0] - eps || b.min[1] < refBox.min[1] - eps || b.max[0] > refBox.max[0] + eps || b.max[1] > refBox.max[1] + eps;
  };

  /**
   * 文字を面に入る大きさにして、面の真ん中に置く。はみ出していなければ null。
   * 位置の点はきまりで動かないこともあるので、拘束計算(ドラッグと同じ)で動かす。
   */
  const fitTextToFace = (d: SketchData, textId: Id): { sketch: SketchData; size: number } | null => {
    const e = d.entities.find((x) => x.id === textId);
    if (!refBox || e?.type !== "text" || !overflows(e, d.entities)) return null;
    const unit = textBox({ ...e, size: 1 }, [0, 0]);
    const w = unit.max[0] - unit.min[0];
    const h = unit.max[1] - unit.min[1];
    const faceW = refBox.max[0] - refBox.min[0];
    const faceH = refBox.max[1] - refBox.min[1];
    const size = Math.max(0.5, Math.floor(Math.min((faceW * 0.85) / w, (faceH * 0.7) / h, e.size) * 2) / 2);
    const cx = (refBox.min[0] + refBox.max[0]) / 2;
    const cy = (refBox.min[1] + refBox.max[1]) / 2;
    const target: Vec2 = [cx - (w * size) / 2, cy - ((unit.max[1] + unit.min[1]) / 2) * size];
    const resized = updateText(d, textId, { size });
    if (e.p === ORIGIN_ID) return { sketch: resized, size };
    const moved = drag(gcs, resized, { points: [{ id: e.p, x: target[0], y: target[1] }] });
    return { sketch: moved ?? resized, size };
  };

  // ---- 寸法 ----

  const askDimension = (c: NewDimension, measured: number, title: string, unit = "mm") => {
    setNumpad({
      title,
      unit,
      initial: Math.abs(measured),
      allowZero: c.type === "angle",
      submit: (v, expr) => {
        const value = c.type === "angle" && measured < 0 ? -v : v;
        const r = addConstraint(gcs, data, { ...c, id: newId("d"), value, expr } as DimensionConstraint);
        if (r.ok) onEdit(r.sketch, data);
        else onMessage(r.message!, "error");
        setNumpad(null);
        setDimPick([]);
      },
    });
  };

  const editDimension = (c: DimensionConstraint) => {
    const titles = { length: "長さ", distance: "距離", diameter: "直径", angle: "角度" } as const;
    setNumpad({
      title: `${titles[c.type]}を変える`,
      unit: c.type === "angle" ? "°" : "mm",
      initial: Math.abs(c.value),
      initialExpr: c.expr,
      allowZero: c.type === "angle",
      submit: (v, expr) => {
        const r = setDimension(gcs, data, c.id, c.type === "angle" && c.value < 0 ? -v : v, expr);
        if (r.ok) onEdit(r.sketch, data);
        else onMessage(r.message!, "error");
        setNumpad(null);
      },
    });
  };

  const pickForDimension = (hit: Hit | null) => {
    if (!hit) return setDimPick([]);
    if (hit.kind === "constraint") {
      const c = sketch.constraints.find((x) => x.id === hit.id);
      if (c && isDimension(c)) editDimension(c);
      return;
    }
    const e = ents.get(hit.id);
    const picks = [...dimPick, hit];
    if (hit.kind === "curve" && (e?.type === "circle" || e?.type === "arc")) {
      askDimension({ type: "diameter", circle: hit.id }, e.r * 2, "直径を入れる");
      return;
    }
    if (hit.kind === "curve" && e?.type === "line") {
      setDimPick([hit]);
      askDimension({ type: "length", line: e.id }, measureLength(sketch.entities, e), "長さを入れる");
      return;
    }
    if (picks.length === 1) {
      setDimPick(picks);
      setGuide("もう1つの点をタップすると、2つの点の距離を入れられます");
      return;
    }
    const [a, b] = picks;
    setGuide(null);
    if (a.kind === "point" && b.kind === "point" && a.id !== b.id) {
      askDimension({ type: "distance", a: a.id, b: b.id }, dist(pos.get(a.id)!, pos.get(b.id)!), "2つの点の距離を入れる");
    } else {
      setDimPick([hit]);
    }
  };

  // ---- 指・マウスの操作 ----

  /**
   * えらぶ道具で点・線・文字を動かしかけていたら、動かす前の形にもどす。
   * (動かしている間は「もどす」に積んでいないので、そのままにすると、もどせない形の変化が残ってしまう)
   */
  const undoDragPreview = () => {
    const press = pressRef.current;
    if (tool === "select" && press?.moved && press.hit && press.hit.kind !== "constraint") onPreview(press.before);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    lastPointer.current = e.pointerType;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // 2本指: 拡大縮小と移動。1本目の操作は取り消す
      undoDragPreview();
      pressRef.current = null;
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { dist: dist(p1, p2), mid: mid(p1, p2), vp };
      return;
    }
    if (pointers.current.size > 2) return;
    pressRef.current = { pointerId: e.pointerId, start: p, last: p, moved: false, hit: hitTest(p), before: data, vpStart: vp };
    if (tool !== "select" && tool !== "dimension") setCursor(snapAt(p, pending.at(-1)));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const scale = Math.min(Math.max(g.vp.scale * (dist(p1, p2) / g.dist), 0.2), 200);
      const m = mid(p1, p2);
      const anchor = toWorld(g.vp, g.mid);
      setVp((v) => {
        const nv = { ...v, cx: g.vp.cx, cy: g.vp.cy, scale };
        const now = toWorld(nv, m);
        return { ...nv, cx: g.vp.cx + anchor[0] - now[0], cy: g.vp.cy + anchor[1] - now[1] };
      });
      return;
    }
    const press = pressRef.current;
    if (tool !== "select" && tool !== "dimension") setCursor(snapAt(p, pending.at(-1)));
    if (!press || press.pointerId !== e.pointerId) return;
    if (!press.moved && dist(p, press.start) > MOVE_PX) press.moved = true;
    if (!press.moved) return;
    if (tool === "select" || tool === "dimension") {
      const hit = press.hit;
      if (tool === "select" && hit?.kind === "point" && hit.id !== ORIGIN_ID) {
        const target = toWorld(vp, p);
        const next = drag(gcs, sketch, { points: [{ id: hit.id, x: target[0], y: target[1] }] });
        if (next) onPreview(next);
      } else if (tool === "select" && hit?.kind === "curve" && ents.get(hit.id)?.type === "text") {
        // 文字をつかんで動かす = 位置の点を動かす
        const t = ents.get(hit.id) as Extract<SketchEntity, { type: "text" }>;
        if (t.p !== ORIGIN_ID) {
          const d = sub(toWorld(vp, p), toWorld(vp, press.start));
          const from = positions(press.before.entities).get(t.p)!;
          const next = drag(gcs, { ...sketch, entities: press.before.entities }, { points: [{ id: t.p, x: from[0] + d[0], y: from[1] + d[1] }] });
          if (next) onPreview(next);
        }
      } else if (tool === "select" && hit?.kind === "curve" && ents.get(hit.id)?.type === "line") {
        const line = ents.get(hit.id) as LineEntity;
        const d = sub(toWorld(vp, p), toWorld(vp, press.start));
        const before = positions(press.before.entities);
        const pts = [line.p1, line.p2]
          .filter((id) => id !== ORIGIN_ID)
          .map((id) => ({ id, x: before.get(id)![0] + d[0], y: before.get(id)![1] + d[1] }));
        const next = drag(gcs, { ...sketch, entities: press.before.entities }, { points: pts });
        if (next) onPreview(next);
      } else {
        // 何もないところのドラッグは画面の移動
        const d = sub(p, press.start);
        setVp((v) => ({ ...v, cx: press.vpStart.cx - d[0] / v.scale, cy: press.vpStart.cy + d[1] / v.scale }));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (gesture.current) {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.pointerId !== e.pointerId) return;

    if (tool === "select") {
      if (press.moved) {
        if (press.hit && press.hit.kind !== "constraint") onEdit({ entities: getLatest().entities, constraints: sketch.constraints }, press.before);
        return;
      }
      const hit = press.hit;
      if (!hit) return setSelection([]);
      if (hit.kind === "constraint") {
        const c = sketch.constraints.find((x) => x.id === hit.id);
        if (c && isDimension(c) && selection.length === 0) return editDimension(c);
      }
      setSelection((sel) => (sel.includes(hit.id) ? sel.filter((s) => s !== hit.id) : [...sel, hit.id]));
      return;
    }
    if (tool === "dimension") {
      if (!press.moved) pickForDimension(press.hit);
      return;
    }
    if (tool === "text") {
      const at = snapAt(p);
      setCursor(at);
      askText("文字を入れる", "", 10, (text, size) => {
        const { sketch: next, textId } = addText(data, at.spec, text, size);
        // 面にかいていて、文字が面からはみ出すなら、入る大きさにする(名札でよくある失敗なので)
        const fitted = fitTextToFace(next, textId);
        commit(fitted?.sketch ?? next);
        if (fitted) onMessage(`面からはみ出さないように、文字の大きさを ${fmt(fitted.size)} mm にして、面の真ん中に置きました`);
        setTool("select");
      });
      return;
    }
    // 描く道具: 押した点と離した点が離れていればドラッグで描いたとみなす
    const end = snapAt(p, pending.at(-1));
    const startSnap = press.moved ? snapAt(press.start) : null;
    placePoint(end, startSnap);
  };

  // ドラッグ中は最新の draft を使いたいので、props の sketch を読む
  const latest = useRef(sketch);
  latest.current = sketch;
  const getLatest = () => latest.current;

  // ---- 選んだものへの操作(拘束) ----

  const selEnts = selection.map((id) => (id === ORIGIN_ID ? ({ id, type: "point", x: 0, y: 0 } as SketchEntity) : ents.get(id))).filter(Boolean) as SketchEntity[];
  const selLines = selEnts.filter((e) => e.type === "line");
  const selPoints = selEnts.filter((e) => e.type === "point");
  const selRound = selEnts.filter((e) => e.type === "circle" || e.type === "arc");
  const selCurves = selEnts.filter(isCurve);
  const selText = selEnts.length === 1 && selEnts[0].type === "text" ? selEnts[0] : null;
  const selConstraints = selection.filter((id) => sketch.constraints.some((c) => c.id === id));

  const apply = (cs: SketchConstraint[]) => {
    let cur = data;
    for (const c of cs) {
      const r = addConstraint(gcs, cur, c);
      if (!r.ok) {
        onMessage(r.message!, "error");
        return;
      }
      cur = r.sketch;
    }
    onEdit(cur, data);
    setSelection([]);
  };

  const constraintButtons: { key: string; label: string; enabled: boolean; run: () => void }[] = [
    {
      key: "horizontal",
      label: term("horizontal", pro),
      enabled: selLines.length >= 1 && selLines.length === selEnts.length,
      run: () => apply(selLines.map((l) => ({ id: newId("c"), type: "horizontal", line: l.id }))),
    },
    {
      key: "vertical",
      label: term("vertical", pro),
      enabled: selLines.length >= 1 && selLines.length === selEnts.length,
      run: () => apply(selLines.map((l) => ({ id: newId("c"), type: "vertical", line: l.id }))),
    },
    {
      key: "coincident",
      label: term("coincident", pro),
      enabled: selEnts.length === 2 && selPoints.length >= 1 && selEnts.every((e) => e.type !== "text"),
      run: () => {
        const [a, b] = selEnts;
        const [pt, other] = a.type === "point" ? [a, b] : [b, a];
        if (other.type === "point") apply([{ id: newId("c"), type: "coincident", a: pt.id, b: other.id }]);
        else if (other.type === "line") apply([{ id: newId("c"), type: "pointOnLine", point: pt.id, line: other.id }]);
        else apply([{ id: newId("c"), type: "pointOnCircle", point: pt.id, circle: other.id }]);
      },
    },
    {
      key: "parallel",
      label: term("parallel", pro),
      enabled: selLines.length === 2 && selEnts.length === 2,
      run: () => apply([{ id: newId("c"), type: "parallel", a: selLines[0].id, b: selLines[1].id }]),
    },
    {
      key: "perpendicular",
      label: term("perpendicular", pro),
      enabled: selLines.length === 2 && selEnts.length === 2,
      run: () => apply([{ id: newId("c"), type: "perpendicular", a: selLines[0].id, b: selLines[1].id }]),
    },
    {
      key: "equal",
      label: term("equal", pro),
      enabled: selEnts.length === 2 && (selLines.length === 2 || selRound.length === 2),
      run: () => apply([{ id: newId("c"), type: "equal", a: selEnts[0].id, b: selEnts[1].id }]),
    },
  ];

  const dimensionButtons: { key: string; label: string; enabled: boolean; run: () => void }[] = [
    {
      key: "angle",
      label: "角度",
      enabled: selLines.length === 2 && selEnts.length === 2,
      run: () => {
        const [la, lb] = selLines as LineEntity[];
        setSelection([]);
        askDimension({ type: "angle", a: la.id, b: lb.id }, measureAngle(sketch.entities, la, lb), "角度を入れる", "°");
      },
    },
    {
      key: "distance",
      label: "距離",
      enabled: selPoints.length === 2 && selEnts.length === 2,
      run: () => {
        const [pa, pb] = selPoints;
        setSelection([]);
        askDimension({ type: "distance", a: pa.id, b: pb.id }, dist(pos.get(pa.id)!, pos.get(pb.id)!), "2つの点の距離を入れる");
      },
    },
  ];

  const deleteSelection = () => {
    if (selection.length === 0) return;
    commit(deleteItems(data, selection), false);
    setSelection([]);
  };


  // ---- 描画 ----

  const color = (e: SketchEntity) => {
    if (selection.includes(e.id) || dimPick.some((d) => d.id === e.id)) return "var(--sk-selected)";
    if (e.construction) return "var(--sk-construction)";
    return defined ? "var(--sk-defined)" : "var(--sk-free)";
  };
  const S = (p: Vec2) => toScreen(vp, p);
  const labels: Label[] = [];
  // 下の描画で寸法・拘束のラベルの位置が入る(タップ判定に使う)
  labelsRef.current = labels;

  const step = gridStep(vp.scale);
  const tl = toWorld(vp, [0, 0]);
  const br = toWorld(vp, [vp.width, vp.height]);
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let x = Math.ceil(tl[0] / step) * step; x <= br[0]; x += step) {
    const sx = S([x, 0])[0];
    gridLines.push({ x1: sx, y1: 0, x2: sx, y2: vp.height, major: Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 1e-6 });
  }
  for (let y = Math.ceil(br[1] / step) * step; y <= tl[1]; y += step) {
    const sy = S([0, y])[1];
    gridLines.push({ x1: 0, y1: sy, x2: vp.width, y2: sy, major: Math.abs(y / (step * 5) - Math.round(y / (step * 5))) < 1e-6 });
  }
  const origin = S([0, 0]);
  const major = step * 5;
  const gridLabels: { x: number; y: number; text: string; anchor: "start" | "middle" | "end" }[] = [];
  {
    // 原点の線が画面の外なら、画面のふちに出す
    const ly = Math.min(Math.max(origin[1] + 16, 16), vp.height - 60);
    const lx = Math.min(Math.max(origin[0] - 6, 40), vp.width - 8);
    for (let x = Math.ceil(tl[0] / major) * major; x <= br[0]; x += major) {
      if (Math.abs(x) < 1e-9) continue;
      gridLabels.push({ x: S([x, 0])[0], y: ly, text: fmt(x), anchor: "middle" });
    }
    for (let y = Math.ceil(br[1] / major) * major; y <= tl[1]; y += major) {
      if (Math.abs(y) < 1e-9) continue;
      gridLabels.push({ x: lx, y: S([0, y])[1] + 4, text: fmt(y), anchor: "end" });
    }
  }

  const dimLabel = (c: SketchConstraint): { at: Vec2; text: string; line?: [Vec2, Vec2] } | null => {
    switch (c.type) {
      case "length": {
        const l = ents.get(c.line);
        if (l?.type !== "line") return null;
        const a = S(pos.get(l.p1)!);
        const b = S(pos.get(l.p2)!);
        const n = normal(a, b);
        return { at: [(a[0] + b[0]) / 2 + n[0] * 28, (a[1] + b[1]) / 2 + n[1] * 28], text: withExpr(c, fmt(c.value)) };
      }
      case "distance": {
        const a = S(pos.get(c.a)!);
        const b = S(pos.get(c.b)!);
        return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 20], text: withExpr(c, fmt(c.value)), line: [a, b] };
      }
      case "diameter": {
        const e = ents.get(c.circle);
        if (e?.type !== "circle" && e?.type !== "arc") return null;
        const cc = S(pos.get(e.c)!);
        return { at: [cc[0] + e.r * vp.scale * 0.7, cc[1] - e.r * vp.scale * 0.7 - 16], text: withExpr(c, `⌀${fmt(c.value)}`) };
      }
      case "angle": {
        const la = ents.get(c.a);
        const lb = ents.get(c.b);
        if (la?.type !== "line" || lb?.type !== "line") return null;
        const ma = mid(S(pos.get(la.p1)!), S(pos.get(la.p2)!));
        const mb = mid(S(pos.get(lb.p1)!), S(pos.get(lb.p2)!));
        return { at: mid(ma, mb), text: withExpr(c, `${fmt(Math.abs(c.value))}°`) };
      }
      default:
        return null;
    }
  };

  const glyph = (c: SketchConstraint): { at: Vec2; text: string }[] => {
    const lineMid = (id: Id, off: number): Vec2 | null => {
      const l = ents.get(id);
      if (l?.type !== "line") return null;
      const a = S(pos.get(l.p1)!);
      const b = S(pos.get(l.p2)!);
      const n = normal(a, b);
      const t = 0.3;
      return [a[0] + (b[0] - a[0]) * t - n[0] * off, a[1] + (b[1] - a[1]) * t - n[1] * off];
    };
    const sym: Partial<Record<SketchConstraint["type"], string>> = { horizontal: "―", vertical: "|", parallel: "∥", perpendicular: "⊥", equal: "=" };
    const t = sym[c.type];
    if (!t) return [];
    if (c.type === "horizontal" || c.type === "vertical") {
      const at = lineMid(c.line, GLYPH_GAP);
      return at ? [{ at, text: t }] : [];
    }
    if (c.type === "parallel" || c.type === "perpendicular" || c.type === "equal") {
      return [c.a, c.b].flatMap((id) => {
        const at = lineMid(id, GLYPH_GAP);
        if (at) return [{ at, text: t }];
        const e = ents.get(id);
        if (e?.type === "circle" || e?.type === "arc") {
          const cc = S(pos.get(e.c)!);
          return [{ at: [cc[0] - e.r * vp.scale * 0.7 - 10, cc[1] + e.r * vp.scale * 0.7 + 10] as Vec2, text: t }];
        }
        return [];
      });
    }
    return [];
  };

  // 描く途中の見本
  const preview = (() => {
    if (!cursor || pending.length === 0 || tool === "select" || tool === "dimension") return null;
    const a = pending[0].xy;
    const b = cursor.xy;
    switch (tool) {
      case "line":
        return <line x1={S(pending.at(-1)!.xy)[0]} y1={S(pending.at(-1)!.xy)[1]} x2={S(b)[0]} y2={S(b)[1]} className="sk-preview" />;
      case "rect": {
        const [x1, y1] = S(a);
        const [x2, y2] = S(b);
        return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} className="sk-preview" />;
      }
      case "circle":
        return <circle cx={S(a)[0]} cy={S(a)[1]} r={dist(a, b) * vp.scale} className="sk-preview" />;
      case "polygon": {
        const r = dist(a, b);
        const a0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const pts = Array.from({ length: sides }, (_, i) => S([a[0] + r * Math.cos(a0 + (2 * Math.PI * i) / sides), a[1] + r * Math.sin(a0 + (2 * Math.PI * i) / sides)]));
        return <polygon points={pts.map((p) => p.join(",")).join(" ")} className="sk-preview" />;
      }
      case "arc": {
        if (pending.length === 1) return <line x1={S(a)[0]} y1={S(a)[1]} x2={S(b)[0]} y2={S(b)[1]} className="sk-preview" />;
        const s = pending[1].xy;
        const r = dist(a, s);
        const a0 = Math.atan2(s[1] - a[1], s[0] - a[0]);
        let a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (a1 <= a0) a1 += Math.PI * 2;
        return <path d={arcPath(vp, a, r, a0, a1)} className="sk-preview" />;
      }
      default:
        return null;
    }
  })();

  const readout = (() => {
    if (!cursor || tool === "select" || tool === "dimension") return null;
    const last = pending.at(-1)?.xy;
    let text = `x ${fmt(cursor.xy[0])}  y ${fmt(cursor.xy[1])}`;
    if (last && (tool === "line" || tool === "circle" || tool === "polygon")) text = `${tool === "line" ? "長さ" : "半径"} ${fmt(dist(last, cursor.xy))}`;
    if (last && tool === "rect") text = `${fmt(Math.abs(cursor.xy[0] - last[0]))} × ${fmt(Math.abs(cursor.xy[1] - last[1]))}`;
    const s = S(cursor.xy);
    return { x: s[0], y: s[1] - 44, text };
  })();

  const dofText = !status.ok
    ? "寸法や拘束が矛盾しています"
    : sketch.entities.length === 0
      ? "まだ何もかいていません"
      : status.dof === 0
        ? term("fullyDefined", pro)
        : `あと ${status.dof} つで形が決まる`;
  // 長い説明は、マウスをのせる・長押しで出す(2026-11-10: 下の説明を短くした)
  const dofTip =
    status.ok && status.dof > 0 && sketch.entities.length > 0
      ? `このままでも立体にできます。あと ${status.dof} つ寸法か「${term("constraint", pro)}」を入れると、形が動かなくなり、線がみどりから黒に変わります`
      : undefined;

  // きまりの記号を1つだけえらんだときは、その意味を上に出す
  const selGlyph = selection.length === 1 ? sketch.constraints.find((c) => c.id === selection[0] && CONSTRAINT_MEANING[c.type]) : undefined;
  const glyphHint = selGlyph ? `${term(selGlyph.type as TermKey, pro)}: ${CONSTRAINT_MEANING[selGlyph.type]}` : null;

  const overflowText = sketch.entities.find((e): e is Extract<SketchEntity, { type: "text" }> => e.type === "text" && overflows(e)) ?? null;

  const hint = glyphHint ?? guide ?? (pending.length > 0 ? nextStepHint(tool, pending.length) : null) ?? TOOLS.find((t) => t.tool === tool)!.hint;

  return (
    <div className="sketch-editor">
      <div className="sk-toolbar" role="toolbar" aria-label="スケッチの道具">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className={tool === t.tool ? "tool active" : "tool"}
            aria-pressed={tool === t.tool}
            data-testid={`tool-${t.tool}`}
            data-tip={t.hint}
            onClick={() => setTool(t.tool)}
          >
            <span className="tool-icon" aria-hidden>
              <Icon name={t.icon} size={22} />
            </span>
            {t.label}
          </button>
        ))}
        {tool === "polygon" && (
          <div className="sides">
            <button type="button" aria-label="角を減らす" onClick={() => setSides((n) => Math.max(3, n - 1))}>
              −
            </button>
            <span data-testid="polygon-sides">{sides}角形</span>
            <button type="button" aria-label="角を増やす" onClick={() => setSides((n) => Math.min(12, n + 1))}>
              ＋
            </button>
          </div>
        )}
      </div>

      <div className="sk-canvas-wrap">
        <svg
          ref={svgRef}
          className="sk-canvas"
          data-testid="sketch-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            // 指の操作が取り消された(手のひらが当たった・画面の端からのスワイプなど)ときは、動かしかけた形をもとにもどす
            if (pressRef.current?.pointerId === e.pointerId) undoDragPreview();
            pressRef.current = null;
            gesture.current = null;
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && !pressRef.current && setCursor(null)}
          onWheel={(e) => {
            const p = local(e);
            const anchor = toWorld(vp, p);
            const scale = Math.min(Math.max(vp.scale * Math.exp(-e.deltaY * 0.0015), 0.2), 200);
            const nv = { ...vp, scale };
            const now = toWorld(nv, p);
            setVp({ ...nv, cx: vp.cx + anchor[0] - now[0], cy: vp.cy + anchor[1] - now[1] });
          }}
        >
          {gridLines.map((g, i) => (
            <line key={i} {...g} className={g.major ? "sk-grid major" : "sk-grid"} />
          ))}
          <line x1={0} x2={vp.width} y1={origin[1]} y2={origin[1]} className="sk-axis-x" />
          <line x1={origin[0]} x2={origin[0]} y1={0} y2={vp.height} className="sk-axis-y" />
          {/* 目もり: 太いマス目ごとに mm の数字 */}
          {gridLabels.map((g, i) => (
            <text key={`gl${i}`} x={g.x} y={g.y} className="sk-grid-label" textAnchor={g.anchor}>
              {g.text}
            </text>
          ))}

          {/* 押し出せる面をうすく塗る */}
          {profiles.regions.map((r, i) => (
            <path
              key={i}
              className="sk-region"
              fillRule="evenodd"
              d={[r.outer, ...r.holes].map((l) => "M" + l.polygon.map((p) => S(p).join(" ")).join("L") + "Z").join("")}
            />
          ))}

          {/* 下がき: 面の上にある立体の輪郭 */}
          {refs.length > 0 && (
            <path
              className="sk-ref"
              data-testid="sketch-references"
              d={Array.from({ length: refs.length / 4 }, (_, i) => {
                const a = S([refs[i * 4], refs[i * 4 + 1]]);
                const b = S([refs[i * 4 + 2], refs[i * 4 + 3]]);
                return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
              }).join("")}
            />
          )}

          {sketch.entities.map((e) => {
            const cls = e.construction ? "sk-curve construction" : "sk-curve";
            const stroke = color(e);
            if (e.type === "line") {
              const a = S(pos.get(e.p1)!);
              const b = S(pos.get(e.p2)!);
              return <line key={e.id} data-id={e.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={cls} stroke={stroke} />;
            }
            if (e.type === "circle") {
              const c = S(pos.get(e.c)!);
              return <circle key={e.id} data-id={e.id} cx={c[0]} cy={c[1]} r={e.r * vp.scale} className={cls} stroke={stroke} />;
            }
            if (e.type === "arc") return <path key={e.id} data-id={e.id} d={arcPath(vp, pos.get(e.c)!, e.r, e.a0, e.a1)} className={cls} stroke={stroke} />;
            if (e.type === "text" && pos.has(e.p)) {
              // 3D と同じフォントで、左下(ベースライン)を位置の点にそろえて表示する
              const at = S(pos.get(e.p)!);
              return (
                <text key={e.id} data-id={e.id} x={at[0]} y={at[1]} className="sk-text" fill={stroke} fontSize={e.size * vp.scale} data-testid="sketch-text">
                  {e.text}
                </text>
              );
            }
            return null;
          })}

          {sketch.constraints.flatMap((c) =>
            glyph(c).map((g, i) => {
              const sel = selection.includes(c.id);
              labels.push({ id: c.id, x: g.at[0], y: g.at[1], w: GLYPH_SIZE + 8, h: GLYPH_SIZE + 8 });
              return (
                <g key={`${c.id}-${i}`} className={sel ? "sk-glyph selected" : "sk-glyph"}>
                  <rect x={g.at[0] - GLYPH_SIZE / 2} y={g.at[1] - GLYPH_SIZE / 2} width={GLYPH_SIZE} height={GLYPH_SIZE} rx={6} />
                  <text x={g.at[0]} y={g.at[1] + 7} textAnchor="middle">
                    {g.text}
                  </text>
                </g>
              );
            }),
          )}

          {sketch.constraints.map((c) => {
            const d = dimLabel(c);
            if (!d) return null;
            // 数字はボタンの字と同じくらい大きくする(20px)。文字のはばから、わくの大きさを決める
            const w = [...d.text].reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 12 : 20), 20);
            labels.push({ id: c.id, x: d.at[0], y: d.at[1], w, h: 34 });
            const sel = selection.includes(c.id);
            return (
              <g key={c.id} className={sel ? "sk-dim selected" : "sk-dim"} data-testid={`dim-${c.type}`}>
                {d.line && <line x1={d.line[0][0]} y1={d.line[0][1]} x2={d.line[1][0]} y2={d.line[1][1]} className="sk-dim-line" />}
                <rect x={d.at[0] - w / 2} y={d.at[1] - 17} width={w} height={34} rx={9} />
                <text x={d.at[0]} y={d.at[1] + 7} textAnchor="middle">
                  {d.text}
                </text>
              </g>
            );
          })}

          {[...pos].map(([id, p]) => {
            const s = S(p);
            const sel = selection.includes(id) || dimPick.some((d) => d.id === id);
            return <circle key={id} cx={s[0]} cy={s[1]} r={id === ORIGIN_ID ? 5 : 4} className={id === ORIGIN_ID ? "sk-origin" : sel ? "sk-point selected" : "sk-point"} />;
          })}

          {preview}
          {pending.map((p, i) => (
            <circle key={i} cx={S(p.xy)[0]} cy={S(p.xy)[1]} r={6} className="sk-pending" />
          ))}
          {cursor && tool !== "select" && tool !== "dimension" && (
            <circle cx={S(cursor.xy)[0]} cy={S(cursor.xy)[1]} r={cursor.snapped ? 10 : 5} className={cursor.snapped ? "sk-cursor snapped" : "sk-cursor"} />
          )}
          {readout && (
            <g className="sk-readout">
              <rect x={readout.x - readout.text.length * 4.5 - 10} y={readout.y - 15} width={readout.text.length * 9 + 20} height={26} rx={8} />
              <text x={readout.x} y={readout.y + 3} textAnchor="middle">
                {readout.text}
              </text>
            </g>
          )}
        </svg>

        <div className="sk-overlay-top">
          <p className="sk-hint" data-testid="sketch-hint">
            {hint}
          </p>
          {selGlyph && (
            <button type="button" className="danger" onClick={deleteSelection} data-testid="glyph-delete">
              この{term("constraint", pro)}をけす
            </button>
          )}
          {pending.length > 0 && (
            <button type="button" onClick={() => setPending([])} data-testid="sketch-pending-stop">
              {tool === "line" ? "線をここで終わる" : "やりなおす"}
            </button>
          )}
        </div>
        <div className="sk-overlay-bottom">
          <span className={defined ? "sk-dof done" : "sk-dof"} data-testid="sketch-dof" data-tip={dofTip}>
            {dofText}
          </span>
          {profiles.openChains > 0 && <span className="sk-warn">閉じていない線があります</span>}
          {overflowText && (
            <span className="sk-warn" data-testid="text-overflow">
              文字が面からはみ出しています
              <button
                type="button"
                data-testid="text-fit"
                onClick={() => {
                  const fitted = fitTextToFace(data, overflowText.id);
                  if (fitted) onEdit(fitted.sketch, data);
                }}
              >
                面に入れる
              </button>
            </span>
          )}
          <span className="sk-scale" data-testid="sketch-scale">
            1マス = {fmt(step)} mm
          </span>
          <button type="button" onClick={fit}>
            全体を表示
          </button>
        </div>
      </div>

      {tool === "select" && (
        <div className="sk-actions" role="toolbar" aria-label={term("constraint", pro)}>
          <span className="sk-actions-title">{term("constraint", pro)}:</span>
          {constraintButtons.map((b) => (
            <button key={b.key} type="button" disabled={!b.enabled} onClick={b.run} data-testid={`con-${b.key}`}>
              {b.label}
            </button>
          ))}
          {dimensionButtons.map((b) => (
            <button key={b.key} type="button" disabled={!b.enabled} onClick={b.run} data-testid={`dim-btn-${b.key}`}>
              {b.label}
            </button>
          ))}
          {selText && (
            <button
              type="button"
              data-testid="text-edit"
              onClick={() =>
                askText("文字をなおす", selText.text, selText.size, (text, size) => {
                  onEdit(updateText(data, selText.id, { text, size }), data);
                  setSelection([]);
                })
              }
            >
              文字をなおす
            </button>
          )}
          <button type="button" disabled={selCurves.length === 0} onClick={() => onEdit(toggleConstruction(data, selection), data)}>
            {term("construction", pro)}
          </button>
          <button type="button" className="danger" disabled={selection.length === 0} onClick={deleteSelection} data-testid="sk-delete">
            けす{selConstraints.length > 0 && selection.length === selConstraints.length ? `(${term("constraint", pro)})` : ""}
          </button>
        </div>
      )}

      {textDialog && <TextDialog title={textDialog.title} initialText={textDialog.text} initialSize={textDialog.size} onSubmit={textDialog.submit} onCancel={() => setTextDialog(null)} />}
      {numpad && <NumberPad title={numpad.title} unit={numpad.unit} initial={numpad.initial} initialExpr={numpad.initialExpr} variables={variables} allowZero={numpad.allowZero} onSubmit={numpad.submit} onCancel={() => { setNumpad(null); setDimPick([]); }} />}
    </div>
  );
}

const NO_REFS = new Float32Array(0);
/** 変数を使っている寸法は「幅=40」のように式も見せる */
const withExpr = (c: SketchConstraint, text: string) => ("expr" in c && c.expr ? `${c.expr}=${text}` : text);
/** 点 p を中心 c のまわりに a だけ回した点 */
const rotate = (c: Vec2, p: Vec2, a: number): Vec2 => [
  c[0] + (p[0] - c[0]) * Math.cos(a) - (p[1] - c[1]) * Math.sin(a),
  c[1] + (p[0] - c[0]) * Math.sin(a) + (p[1] - c[1]) * Math.cos(a),
];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-12)));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** スクリーン上の線分 a→b の左側の単位ベクトル */
function normal(a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}
