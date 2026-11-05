import { useSyncExternalStore } from "react";
import { newId, nextName } from "../doc/ids";
import {
  emptyDocument,
  type CadDocument,
  type ExtrudeFeature,
  type Feature,
  type Id,
  type PlaneRef,
  type SketchFeature,
} from "../doc/types";
import type { RebuildReply } from "../worker/cad.worker";
import type { SketchData } from "../sketch/edit";

export type Mode =
  | { kind: "model" }
  /** スケッチを描く平面を選んでいるところ */
  | { kind: "pickPlane" }
  | { kind: "sketch"; isNew: boolean }
  | { kind: "extrude"; isNew: boolean };

export interface State {
  doc: CadDocument;
  past: CadDocument[];
  future: CadDocument[];
  mode: Mode;
  /** 編集中のスケッチ(完了するまで設計図には入らない) */
  draftSketch: SketchFeature | null;
  sketchPast: SketchData[];
  sketchFuture: SketchData[];
  draftExtrude: ExtrudeFeature | null;
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
  draftExtrude: null,
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
  setState({ doc: next, past: [], future: [], mode: { kind: "model" }, draftSketch: null, draftExtrude: null, selectedFeature: null });
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
  setState({ mode: { kind: "model" }, draftSketch: null, draftExtrude: null, sketchPast: [], sketchFuture: [] });
}

// ---- 押し出し ----

export function startExtrude(sketchId?: Id) {
  const sketches = state.doc.features.filter((f): f is SketchFeature => f.type === "sketch");
  if (sketches.length === 0) {
    toast("先にスケッチ(絵)をかいてください", "error");
    return;
  }
  const used = new Set(state.doc.features.flatMap((f) => (f.type === "extrude" ? [f.sketchId] : [])));
  const target = sketchId ?? [...sketches].reverse().find((s) => !used.has(s.id))?.id ?? sketches.at(-1)!.id;
  const hasBody = state.doc.features.some((f) => f.type === "extrude");
  const ex: ExtrudeFeature = {
    id: newId("ex"),
    type: "extrude",
    name: nextName("押し出し", state.doc.features.map((f) => f.name)),
    sketchId: target,
    distance: 10,
    operation: "add",
    flip: false,
  };
  setState({ mode: { kind: "extrude", isNew: true }, draftExtrude: ex, selectedFeature: null });
  if (!hasBody) ex.operation = "add";
}

export function updateExtrude(patch: Partial<ExtrudeFeature>) {
  if (!state.draftExtrude) return;
  setState({ draftExtrude: { ...state.draftExtrude, ...patch } });
}

export function finishExtrude() {
  const s = state;
  if (s.mode.kind !== "extrude" || !s.draftExtrude) return;
  const ex = s.draftExtrude;
  const features = s.mode.isNew ? [...s.doc.features, ex] : s.doc.features.map((f) => (f.id === ex.id ? ex : f));
  commitDoc({ ...s.doc, features });
  setState({ mode: { kind: "model" }, draftExtrude: null, selectedFeature: ex.id });
}

// ---- 作業のれきし ----

export function editFeature(id: Id) {
  const f = state.doc.features.find((x) => x.id === id);
  if (!f) return;
  if (f.type === "sketch") {
    setState({ mode: { kind: "sketch", isNew: false }, draftSketch: f, sketchPast: [], sketchFuture: [], selectedFeature: id });
  } else {
    setState({ mode: { kind: "extrude", isNew: false }, draftExtrude: f, selectedFeature: id });
  }
}

/** 消すと一緒に消える作業(スケッチを使っている押し出しなど) */
export function dependents(doc: CadDocument, id: Id): Feature[] {
  return doc.features.filter((f) => f.type === "extrude" && f.sketchId === id);
}

export function deleteFeature(id: Id) {
  const gone = new Set([id, ...dependents(state.doc, id).map((f) => f.id)]);
  commitDoc({ ...state.doc, features: state.doc.features.filter((f) => !gone.has(f.id)) });
  setState({ selectedFeature: null });
}

export function renameDoc(name: string) {
  commitDoc({ ...state.doc, name });
}

/** 画面に出す設計図(編集中の作業を差し込んだもの) */
export function previewDoc(s: State): CadDocument {
  const draft: Feature | null = s.mode.kind === "extrude" ? s.draftExtrude : s.mode.kind === "sketch" ? s.draftSketch : null;
  if (!draft) return s.doc;
  const exists = s.doc.features.some((f) => f.id === draft.id);
  const features = exists ? s.doc.features.map((f) => (f.id === draft.id ? draft : f)) : [...s.doc.features, draft];
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
