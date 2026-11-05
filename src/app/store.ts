// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useSyncExternalStore } from "react";
import { newId, nextName } from "../doc/ids";
import {
  emptyDocument,
  type CadDocument,
  type ExtrudeFeature,
  type Feature,
  type FilletFeature,
  type MirrorFeature,
  type PatternFeature,
  type RevolveFeature,
  type Variable,
  type Id,
  type PlaneRef,
  type SketchFeature,
} from "../doc/types";
import type { RebuildReply } from "../worker/cad.worker";
import type { SketchData } from "../sketch/edit";
import { applyVariables, forgetName, renameInDoc } from "../doc/variables";

export type Mode =
  | { kind: "model" }
  /** スケッチを描く平面を選んでいるところ */
  | { kind: "pickPlane" }
  | { kind: "sketch"; isNew: boolean }
  /** 押し出し・回転・角を丸める・対称・ならべるの設定中 */
  | { kind: "op"; isNew: boolean };

/** スケッチ以外の作業 */
export type OpFeature = ExtrudeFeature | RevolveFeature | FilletFeature | MirrorFeature | PatternFeature;

/** ミラー・パターンで写せる作業(形を作った作業) */
export const COPYABLE_TYPES = ["extrude", "revolve", "mirror", "pattern"] as const;
export const isCopyable = (f: Feature) => (COPYABLE_TYPES as readonly string[]).includes(f.type);

export interface State {
  doc: CadDocument;
  past: CadDocument[];
  future: CadDocument[];
  mode: Mode;
  /** 編集中のスケッチ(完了するまで設計図には入らない) */
  draftSketch: SketchFeature | null;
  sketchPast: SketchData[];
  sketchFuture: SketchData[];
  draftOp: OpFeature | null;
  /** 角を丸めるとき、できあがりを見せるか(見せない間は、丸める前の立体で辺をえらぶ) */
  opPreview: boolean;
  selectedFeature: Id | null;
  result: RebuildReply | null;
  busy: boolean;
  proTerms: boolean;
  toast: { text: string; kind: "info" | "error" } | null;
}

const PRO_KEY = "student-cad:proTerms";

function readPro(): boolean {
  try {
    return localStorage.getItem(PRO_KEY) === "1";
  } catch {
    return false;
  }
}

let state: State = {
  doc: emptyDocument(),
  past: [],
  future: [],
  mode: { kind: "model" },
  draftSketch: null,
  sketchPast: [],
  sketchFuture: [],
  draftOp: null,
  opPreview: false,
  selectedFeature: null,
  result: null,
  busy: false,
  proTerms: readPro(),
  toast: null,
};

const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

const HISTORY_LIMIT = 100;

// ---- 設計図の変更(もどす/やりなおすの対象) ----

export function commitDoc(next: CadDocument) {
  setState((s) => ({ doc: next, past: [...s.past, s.doc].slice(-HISTORY_LIMIT), future: [] }));
}

export function replaceDoc(next: CadDocument) {
  setState({ doc: next, past: [], future: [], mode: { kind: "model" }, draftSketch: null, draftOp: null, selectedFeature: null });
}

export function undo() {
  const s = state;
  if (s.mode.kind === "sketch") {
    const prev = s.sketchPast.at(-1);
    if (!prev || !s.draftSketch) return;
    setState({
      draftSketch: { ...s.draftSketch, ...prev },
      sketchPast: s.sketchPast.slice(0, -1),
      sketchFuture: [...s.sketchFuture, pick(s.draftSketch)],
    });
    return;
  }
  const prev = s.past.at(-1);
  if (!prev) return;
  setState({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future] });
}

export function redo() {
  const s = state;
  if (s.mode.kind === "sketch") {
    const next = s.sketchFuture.at(-1);
    if (!next || !s.draftSketch) return;
    setState({
      draftSketch: { ...s.draftSketch, ...next },
      sketchFuture: s.sketchFuture.slice(0, -1),
      sketchPast: [...s.sketchPast, pick(s.draftSketch)],
    });
    return;
  }
  const [next, ...rest] = s.future;
  if (!next) return;
  setState({ doc: next, past: [...s.past, s.doc], future: rest });
}

const pick = (s: SketchFeature): SketchData => ({ entities: s.entities, constraints: s.constraints });

// ---- スケッチ ----

export function startPickPlane() {
  setState({ mode: { kind: "pickPlane" }, selectedFeature: null });
}

export function startSketch(plane: PlaneRef) {
  const names = state.doc.features.map((f) => f.name);
  const sketch: SketchFeature = {
    id: newId("sk"),
    type: "sketch",
    name: nextName("スケッチ", names),
    plane,
    entities: [],
    constraints: [],
  };
  setState({ mode: { kind: "sketch", isNew: true }, draftSketch: sketch, sketchPast: [], sketchFuture: [] });
}

/** スケッチの中身を変える(スケッチの中の「もどす」に積む) */
export function editSketch(next: SketchData, recordFrom?: SketchData) {
  const s = state;
  if (!s.draftSketch) return;
  setState({
    draftSketch: { ...s.draftSketch, ...next },
    sketchPast: [...s.sketchPast, recordFrom ?? pick(s.draftSketch)].slice(-HISTORY_LIMIT),
    sketchFuture: [],
  });
}

/** ドラッグ中のように、もどすに積まずに形だけ変える */
export function previewSketch(next: SketchData) {
  if (!state.draftSketch) return;
  setState({ draftSketch: { ...state.draftSketch, ...next } });
}

export function finishSketch(): SketchFeature | null {
  const s = state;
  if (s.mode.kind !== "sketch" || !s.draftSketch) return null;
  const sk = s.draftSketch;
  const features = s.mode.isNew ? [...s.doc.features, sk] : s.doc.features.map((f) => (f.id === sk.id ? sk : f));
  commitDoc({ ...s.doc, features });
  setState({ mode: { kind: "model" }, draftSketch: null, sketchPast: [], sketchFuture: [], selectedFeature: sk.id });
  return sk;
}

export function cancelMode() {
  setState({ mode: { kind: "model" }, draftSketch: null, draftOp: null, sketchPast: [], sketchFuture: [] });
}

// ---- 押し出し・回転・角を丸める ----

const sketchesOf = () => state.doc.features.filter((f): f is SketchFeature => f.type === "sketch");

/** まだ使っていないスケッチ(なければ最後のスケッチ) */
function pickSketch(sketchId?: Id): Id | null {
  const sketches = sketchesOf();
  if (sketches.length === 0) {
    toast("先にスケッチ(絵)をかいてください", "error");
    return null;
  }
  const used = new Set(state.doc.features.flatMap((f) => (f.type === "extrude" || f.type === "revolve" ? [f.sketchId] : [])));
  return sketchId ?? [...sketches].reverse().find((s) => !used.has(s.id))?.id ?? sketches.at(-1)!.id;
}

const names = () => state.doc.features.map((f) => f.name);

function startOp(op: OpFeature) {
  setState({ mode: { kind: "op", isNew: true }, draftOp: op, opPreview: op.type !== "fillet", selectedFeature: null });
}

export function startExtrude(sketchId?: Id) {
  const target = pickSketch(sketchId);
  if (!target) return;
  startOp({ id: newId("ex"), type: "extrude", name: nextName("押し出し", names()), sketchId: target, distance: 10, operation: "add", flip: false });
}

export function startRevolve(sketchId?: Id) {
  const target = pickSketch(sketchId);
  if (!target) return;
  const sk = sketchesOf().find((s) => s.id === target)!;
  // 補助線があれば、それを軸にする(コマやコップをかくときの決まった手順)
  const axisLine = sk.entities.find((e) => e.type === "line" && e.construction);
  startOp({
    id: newId("rv"),
    type: "revolve",
    name: nextName("回転", names()),
    sketchId: target,
    axis: axisLine ? { kind: "line", line: axisLine.id } : { kind: "y" },
    angle: 360,
    operation: "add",
    flip: false,
  });
}

export function startFillet(kind: FilletFeature["kind"] = "fillet") {
  if (!state.result?.mesh) {
    toast("先に立体を作ってください", "error");
    return;
  }
  startOp({ id: newId("fl"), type: "fillet", name: nextName(kind === "fillet" ? "丸め" : "面取り", names()), kind, radius: 2, edges: [] });
}

/** 対称にする。ふつうは立体全体を、右の面(左右の真ん中)で写す */
export function startMirror() {
  if (!state.result?.mesh) {
    toast("先に立体を作ってください", "error");
    return;
  }
  startOp({ id: newId("mi"), type: "mirror", name: nextName("ミラー", names()), source: "body", plane: "right" });
}

/** ならべる。ふつうは一番最後に形を作った作業(穴など)をならべる */
export function startPattern() {
  const last = [...state.doc.features].reverse().find(isCopyable);
  if (!last) {
    toast("先に押し出しや回転で形を作ってください", "error");
    return;
  }
  startOp({
    id: newId("pt"),
    type: "pattern",
    name: nextName("パターン", names()),
    source: last.id,
    kind: "linear",
    axis: "x",
    flip: false,
    count: 3,
    spacing: 10,
    angle: 360,
    axis2: "y",
    count2: 1,
    spacing2: 10,
  });
}

export function updateOp(patch: Partial<OpFeature>) {
  if (!state.draftOp) return;
  setState({ draftOp: { ...state.draftOp, ...patch } as OpFeature });
}

export function setOpPreview(on: boolean) {
  setState({ opPreview: on });
}

export function finishOp() {
  const s = state;
  if (s.mode.kind !== "op" || !s.draftOp) return;
  const op = s.draftOp;
  const features = s.mode.isNew ? [...s.doc.features, op] : s.doc.features.map((f) => (f.id === op.id ? op : f));
  commitDoc({ ...s.doc, features });
  setState({ mode: { kind: "model" }, draftOp: null, selectedFeature: op.id });
}

// ---- 作業のれきし ----

export function editFeature(id: Id) {
  const f = state.doc.features.find((x) => x.id === id);
  if (!f) return;
  if (f.type === "sketch") {
    setState({ mode: { kind: "sketch", isNew: false }, draftSketch: f, sketchPast: [], sketchFuture: [], selectedFeature: id });
  } else {
    setState({ mode: { kind: "op", isNew: false }, draftOp: f, opPreview: f.type !== "fillet", selectedFeature: id });
  }
}

/** 消すと一緒に消える作業(スケッチを使っている押し出し、それをならべたパターンなど) */
export function dependents(doc: CadDocument, id: Id): Feature[] {
  const gone = new Set([id]);
  const out: Feature[] = [];
  for (const f of doc.features) {
    const uses = (f.type === "extrude" || f.type === "revolve") ? f.sketchId : f.type === "mirror" || f.type === "pattern" ? f.source : null;
    if (uses && gone.has(uses)) {
      gone.add(f.id);
      out.push(f);
    }
  }
  return out;
}

export function deleteFeature(id: Id) {
  const gone = new Set([id, ...dependents(state.doc, id).map((f) => f.id)]);
  commitDoc({ ...state.doc, features: state.doc.features.filter((f) => !gone.has(f.id)) });
  setState({ selectedFeature: null });
}

export function renameDoc(name: string) {
  commitDoc({ ...state.doc, name });
}

// ---- 変数 ----

/** 変数を変えたら、それを使っている寸法や作業の数も計算し直す */
function commitVariables(doc: CadDocument) {
  commitDoc(applyVariables(doc));
}

export function addVariable(name: string, expr: string) {
  const v: Variable = { id: newId("v"), name, expr, value: 0 };
  commitVariables({ ...state.doc, variables: [...(state.doc.variables ?? []), v] });
}

export function updateVariable(id: Id, patch: { name?: string; expr?: string }) {
  const old = state.doc.variables?.find((v) => v.id === id);
  if (!old) return;
  let doc = state.doc;
  // 名前を変えたら、その名前を使っている式も一緒に変える
  if (patch.name && patch.name !== old.name) doc = renameInDoc(doc, old.name, patch.name);
  if (patch.expr !== undefined) doc = { ...doc, variables: doc.variables!.map((v) => (v.id === id ? { ...v, expr: patch.expr! } : v)) };
  commitVariables(doc);
}

/** 変数を消す。それを使っていた寸法などは、いまの数のまま残す */
export function deleteVariable(id: Id) {
  const v = state.doc.variables?.find((x) => x.id === id);
  if (!v) return;
  const doc = forgetName({ ...state.doc, variables: state.doc.variables!.filter((x) => x.id !== id) }, v.name);
  commitVariables(doc);
}

/** 画面に出す設計図(編集中の作業を差し込んだもの) */
export function previewDoc(s: State): CadDocument {
  const draft: Feature | null = s.mode.kind === "op" ? s.draftOp : s.mode.kind === "sketch" ? s.draftSketch : null;
  if (!draft) return s.doc;
  const idx = s.doc.features.findIndex((f) => f.id === draft.id);
  // 角を丸める辺をえらんでいる間は、その作業より前の形を見せる(丸めた辺はえらべないので)
  if (s.mode.kind === "op" && !s.opPreview) return { ...s.doc, features: idx >= 0 ? s.doc.features.slice(0, idx) : s.doc.features };
  const features = idx >= 0 ? s.doc.features.map((f) => (f.id === draft.id ? draft : f)) : [...s.doc.features, draft];
  return { ...s.doc, features };
}

export function setProTerms(pro: boolean) {
  try {
    localStorage.setItem(PRO_KEY, pro ? "1" : "0");
  } catch {
    // 保存できない端末でも、その場では切り替える
  }
  setState({ proTerms: pro });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, kind: "info" | "error" = "info") {
  clearTimeout(toastTimer);
  setState({ toast: { text, kind } });
  toastTimer = setTimeout(() => setState({ toast: null }), kind === "error" ? 5000 : 2500);
}
