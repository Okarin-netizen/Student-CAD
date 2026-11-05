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
  deleteItems,
  drag,
  setDimension,
  settle,
  toggleConstruction,
  type PointSpec,
  type SketchData,
} from "../../sketch/edit";
import { measureAngle, measureLength, solveSketch } from "../../sketch/solver";
import { findProfiles } from "../../sketch/profiles";
import { term } from "../terms";
import { NumberPad } from "../NumberPad";
import { arcPath, bounds, distToArc, distToSegment, fmt, gridStep, positions, toScreen, toWorld, type Viewport } from "./geometry";

export type Tool = "select" | "line" | "rect" | "circle" | "arc" | "polygon" | "dimension";

interface Props {
  sketch: SketchFeature;
  gcs: GcsWrapper;
  pro: boolean;
  onEdit: (next: SketchData, recordFrom?: SketchData) => void;
  onPreview: (next: SketchData) => void;
  onMessage: (text: string, kind?: "info" | "error") => void;
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

const TOOLS: { tool: Tool; label: string; icon: string; hint: string }[] = [
  { tool: "select", label: "えらぶ", icon: "👆", hint: "点や線をタップしてえらびます。点はドラッグで動かせます。何もないところをドラッグすると画面が動きます" },
  { tool: "line", label: "線", icon: "╱", hint: "始点と終点をタップ(またはドラッグ)。続けてタップすると線がつながります。始めの点をタップすると終わります" },
  { tool: "rect", label: "長方形", icon: "▭", hint: "2つの角をタップ(またはドラッグ)します" },
  { tool: "circle", label: "円", icon: "◯", hint: "中心をタップしてから、円の上の点をタップします" },
  { tool: "arc", label: "円弧", icon: "◠", hint: "中心 → 始点 → 終点の順にタップします(反時計回りにかけます)" },
  { tool: "polygon", label: "多角形", icon: "⬡", hint: "中心をタップしてから、角の1つをタップします" },
  { tool: "dimension", label: "寸法", icon: "↔", hint: "線(長さ)、円(直径)、2つの点(距離)、2本の線(角度)をタップして数字を入れます" },
];

export function SketchEditor({ sketch, gcs, pro, onEdit, onPreview, onMessage }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vp, setVp] = useState<Viewport>({ cx: 30, cy: 20, scale: 6, width: 800, height: 600 });
  const [tool, setTool] = useState<Tool>("line");
  const [selection, setSelection] = useState<Id[]>([]);
  const [pending, setPending] = useState<Snap[]>([]);
  const [cursor, setCursor] = useState<Snap | null>(null);
  const [sides, setSides] = useState(6);
  const [dimPick, setDimPick] = useState<Hit[]>([]);
  const [numpad, setNumpad] = useState<{ title: string; unit: string; initial: number; allowZero?: boolean; submit: (v: number) => void } | null>(null);
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
    if (tool !== "select") setSelection([]);
  }, [tool]);

  const fit = () => {
    const b = bounds(sketch.entities);
    const min = b ? b.min : ([0, 0] as Vec2);
    const max = b ? b.max : ([60, 40] as Vec2);
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
    // 2. マス目に吸い付ける。線の途中なら、水平・垂直にもそろえる
    const step = gridStep(vp.scale) / 2;
    let [x, y] = toWorld(vp, screen);
    x = Math.round(x / step) * step;
    y = Math.round(y / step) * step;
    if (from) {
      const fs = toScreen(vp, from.xy);
      if (Math.abs(fs[1] - screen[1]) < 10) y = from.xy[1];
      else if (Math.abs(fs[0] - screen[0]) < 10) x = from.xy[0];
    }
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
        commit(addCircle(data, pts[0].spec, dist(pts[0].xy, pts[1].xy)));
        return setPending([]);
      }
      case "polygon": {
        if (pts.length < 2) return setPending(pts);
        commit(addPolygon(data, pts[0].spec, pts[1].xy, sides));
        return setPending([]);
      }
      case "arc": {
        if (pts.length < 3) return setPending(pts);
        commit(addArc(data, pts[0].spec, pts[1].spec, pts[2].xy));
        return setPending([]);
      }
    }
  };

  // ---- 寸法 ----

  const askDimension = (c: NewDimension, measured: number, title: string, unit = "mm") => {
    setNumpad({
      title,
      unit,
      initial: Math.abs(measured),
      allowZero: c.type === "angle",
      submit: (v) => {
        const value = c.type === "angle" && measured < 0 ? -v : v;
        const r = addConstraint(gcs, data, { ...c, id: newId("d"), value } as DimensionConstraint);
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
      allowZero: c.type === "angle",
      submit: (v) => {
        const r = setDimension(gcs, data, c.id, c.type === "angle" && c.value < 0 ? -v : v);
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
    if (picks.length === 1) {
      setDimPick(picks);
      if (hit.kind === "curve") onMessage("このまま長さを入れるなら「長さを入れる」、角度にするなら、もう1本の線をタップ");
      else onMessage("もう1つの点をタップすると、2点の距離を入れられます");
      return;
    }
    const [a, b] = picks;
    const ea = ents.get(a.id);
    const eb = ents.get(b.id);
    if (a.kind === "point" && b.kind === "point" && a.id !== b.id) {
      askDimension({ type: "distance", a: a.id, b: b.id }, dist(pos.get(a.id)!, pos.get(b.id)!), "2点の距離を入れる");
    } else if (ea?.type === "line" && eb?.type === "line" && a.id !== b.id) {
      askDimension({ type: "angle", a: a.id, b: b.id }, measureAngle(sketch.entities, ea, eb), "角度を入れる", "°");
    } else {
      setDimPick([hit]);
    }
  };

  // ---- 指・マウスの操作 ----

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // 2本指: 拡大縮小と移動。1本目の操作は取り消す
      if (pressRef.current?.moved && pressRef.current.hit?.kind === "point") onPreview(pressRef.current.before);
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
  const selCurves = selEnts.filter((e) => e.type !== "point");
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
      enabled: selEnts.length === 2 && selPoints.length >= 1,
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

  const deleteSelection = () => {
    if (selection.length === 0) return;
    commit(deleteItems(data, selection), false);
    setSelection([]);
  };

  const lengthOfFirstPick = () => {
    const first = dimPick[0];
    const e = first && ents.get(first.id);
    if (e?.type === "line") askDimension({ type: "length", line: e.id }, measureLength(sketch.entities, e), "長さを入れる");
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

  const dimLabel = (c: SketchConstraint): { at: Vec2; text: string; line?: [Vec2, Vec2] } | null => {
    switch (c.type) {
      case "length": {
        const l = ents.get(c.line);
        if (l?.type !== "line") return null;
        const a = S(pos.get(l.p1)!);
        const b = S(pos.get(l.p2)!);
        const n = normal(a, b);
        return { at: [(a[0] + b[0]) / 2 + n[0] * 22, (a[1] + b[1]) / 2 + n[1] * 22], text: fmt(c.value) };
      }
      case "distance": {
        const a = S(pos.get(c.a)!);
        const b = S(pos.get(c.b)!);
        return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14], text: fmt(c.value), line: [a, b] };
      }
      case "diameter": {
        const e = ents.get(c.circle);
        if (e?.type !== "circle" && e?.type !== "arc") return null;
        const cc = S(pos.get(e.c)!);
        return { at: [cc[0] + e.r * vp.scale * 0.7, cc[1] - e.r * vp.scale * 0.7 - 12], text: `⌀${fmt(c.value)}` };
      }
      case "angle": {
        const la = ents.get(c.a);
        const lb = ents.get(c.b);
        if (la?.type !== "line" || lb?.type !== "line") return null;
        const ma = mid(S(pos.get(la.p1)!), S(pos.get(la.p2)!));
        const mb = mid(S(pos.get(lb.p1)!), S(pos.get(lb.p2)!));
        return { at: mid(ma, mb), text: `${fmt(Math.abs(c.value))}°` };
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
      const at = lineMid(c.line, 16);
      return at ? [{ at, text: t }] : [];
    }
    if (c.type === "parallel" || c.type === "perpendicular" || c.type === "equal") {
      return [c.a, c.b].flatMap((id) => {
        const at = lineMid(id, 16);
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
        ? `🔒 ${term("fullyDefined", pro)}`
        : `あと ${status.dof} つ寸法か${term("constraint", pro)}を入れると、形がすべて決まります`;

  const hint = TOOLS.find((t) => t.tool === tool)!.hint;

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
            onClick={() => setTool(t.tool)}
          >
            <span className="tool-icon" aria-hidden>
              {t.icon}
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
            pressRef.current = null;
            gesture.current = null;
          }}
          onPointerLeave={() => !pressRef.current && setCursor(null)}
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

          {/* 押し出せる面をうすく塗る */}
          {profiles.regions.map((r, i) => (
            <path
              key={i}
              className="sk-region"
              fillRule="evenodd"
              d={[r.outer, ...r.holes].map((l) => "M" + l.polygon.map((p) => S(p).join(" ")).join("L") + "Z").join("")}
            />
          ))}

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
            return null;
          })}

          {sketch.constraints.flatMap((c) =>
            glyph(c).map((g, i) => {
              const sel = selection.includes(c.id);
              labels.push({ id: c.id, x: g.at[0], y: g.at[1], w: 18, h: 18 });
              return (
                <g key={`${c.id}-${i}`} className={sel ? "sk-glyph selected" : "sk-glyph"}>
                  <rect x={g.at[0] - 9} y={g.at[1] - 9} width={18} height={18} rx={4} />
                  <text x={g.at[0]} y={g.at[1] + 5} textAnchor="middle">
                    {g.text}
                  </text>
                </g>
              );
            }),
          )}

          {sketch.constraints.map((c) => {
            const d = dimLabel(c);
            if (!d) return null;
            const w = d.text.length * 9 + 16;
            labels.push({ id: c.id, x: d.at[0], y: d.at[1], w, h: 26 });
            const sel = selection.includes(c.id);
            return (
              <g key={c.id} className={sel ? "sk-dim selected" : "sk-dim"} data-testid={`dim-${c.type}`}>
                {d.line && <line x1={d.line[0][0]} y1={d.line[0][1]} x2={d.line[1][0]} y2={d.line[1][1]} className="sk-dim-line" />}
                <rect x={d.at[0] - w / 2} y={d.at[1] - 13} width={w} height={26} rx={8} />
                <text x={d.at[0]} y={d.at[1] + 5} textAnchor="middle">
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
          <p className="sk-hint">{hint}</p>
          {tool === "dimension" && dimPick.length === 1 && ents.get(dimPick[0].id)?.type === "line" && (
            <button type="button" className="primary" data-testid="dim-length" onClick={lengthOfFirstPick}>
              長さを入れる
            </button>
          )}
          {pending.length > 0 && (
            <button type="button" onClick={() => setPending([])}>
              ここで終わる
            </button>
          )}
        </div>
        <div className="sk-overlay-bottom">
          <span className={defined ? "sk-dof done" : "sk-dof"} data-testid="sketch-dof">
            {dofText}
          </span>
          {profiles.openChains > 0 && <span className="sk-warn">閉じていない線があります</span>}
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
          <button type="button" disabled={selCurves.length === 0} onClick={() => onEdit(toggleConstruction(data, selection), data)}>
            {term("construction", pro)}
          </button>
          <button type="button" className="danger" disabled={selection.length === 0} onClick={deleteSelection} data-testid="sk-delete">
            けす{selConstraints.length > 0 && selection.length === selConstraints.length ? `(${term("constraint", pro)})` : ""}
          </button>
        </div>
      )}

      {numpad && <NumberPad title={numpad.title} unit={numpad.unit} initial={numpad.initial} allowZero={numpad.allowZero} onSubmit={numpad.submit} onCancel={() => { setNumpad(null); setDimPick([]); }} />}
    </div>
  );
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
/** スクリーン上の線分 a→b の左側の単位ベクトル */
function normal(a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}
