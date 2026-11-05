// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useMemo, useRef, useState } from "react";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { BASE_PLANE_LABELS, planeFromFace, resolvePlane } from "../doc/planes";
import { edgesOnPlane } from "./sketch/references";
import type { BasePlaneName, CadDocument, EdgeRef, Vec3 } from "../doc/types";
import { emptyDocument } from "../doc/types";
import { findProfiles } from "../sketch/profiles";
import { CadClient } from "./cadClient";
import { OpPanel } from "./OpPanel";
import { FeatureTree } from "./FeatureTree";
import { downloadFile, isDoc, loadDoc, saveDoc } from "./persist";
import { SketchEditor } from "./sketch/SketchEditor";
import {
  cancelMode,
  deleteFeature,
  editFeature,
  editSketch,
  finishOp,
  finishSketch,
  previewDoc,
  previewSketch,
  redo,
  renameDoc,
  replaceDoc,
  setProTerms,
  setState,
  setOpPreview,
  startExtrude,
  startFillet,
  startRevolve,
  startPickPlane,
  startSketch,
  toast,
  undo,
  updateOp,
  useStore,
} from "./store";
import { term } from "./terms";
import { Viewer3D, type PickResult } from "./Viewer3D";
import "./app.css";

const EMPTY = new Float32Array(0);

export function App() {
  const s = useStore((x) => x);
  const [gcs, setGcs] = useState<GcsWrapper | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** 最後に保存できた設計図(いまの設計図と同じなら「保存ずみ」) */
  const [savedDoc, setSavedDoc] = useState<CadDocument | null>(null);
  const clientRef = useRef<CadClient | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pro = s.proTerms;

  // ---- 起動: 計算用の Worker、拘束計算、保存してあった作品 ----
  useEffect(() => {
    const client = new CadClient();
    clientRef.current = client;
    client.onResult = (r) => setState({ result: r });
    client.onBusy = (busy) => setState({ busy });
    client
      .init()
      .then(() => setReady(true))
      .catch(() => toast("計算の準備に失敗しました。ページを読み込み直してください", "error"));
    let alive = true;
    make_gcs_wrapper(gcsWasmUrl).then((g) => alive && setGcs(g));
    loadDoc().then((doc) => {
      if (!alive) return;
      if (doc) replaceDoc(doc);
      setLoaded(true);
    });
    return () => {
      alive = false;
      client.terminate();
    };
  }, []);

  // ---- 形の計算: 設計図(編集中のものを含む)が変わるたびに Worker へ ----
  const preview = useMemo(() => previewDoc(s), [s.doc, s.mode, s.draftSketch, s.draftOp, s.opPreview]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    clientRef.current?.request(preview);
  }, [preview]);

  // ---- 自動保存(少し待ってから) ----
  useEffect(() => {
    if (!loaded) return;
    const doc = s.doc;
    const save = () => saveDoc(doc).then((ok) => ok && setSavedDoc(doc));
    const t = setTimeout(save, 300);
    // タブを閉じる・アプリを切り替えるときは、待たずに保存する
    const now = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", now);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", now);
    };
  }, [s.doc, loaded]);

  // ---- キーボード(Chromebook 用) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const statuses = s.result?.statuses ?? [];
  const mode = s.mode.kind;
  const canUndo = mode === "sketch" ? s.sketchPast.length > 0 : mode === "model" && s.past.length > 0;
  const canRedo = mode === "sketch" ? s.sketchFuture.length > 0 : mode === "model" && s.future.length > 0;
  const hasBody = !!s.result?.mesh;
  const opError = (() => {
    if (!s.draftOp) return undefined;
    const st = statuses.find((x) => x.id === s.draftOp!.id);
    return st && !st.ok ? st.error : undefined;
  })();

  // ---- 操作 ----

  const onPick = (p: PickResult) => {
    if (p.kind === "base") return startSketch({ kind: "base", name: p.name });
    const owner = [...s.doc.features].reverse().find((f) => f.type !== "sketch");
    startSketch({ kind: "face", featureId: owner?.id ?? "", plane: planeFromFace(p.origin, p.normal) });
  };

  const onFinishSketch = () => {
    const sk = finishSketch();
    if (!sk) return;
    const regions = findProfiles(sk).regions.length;
    const used = s.doc.features.some((f) => (f.type === "extrude" || f.type === "revolve") && f.sketchId === sk.id);
    // 補助線(軸)をかいたスケッチは回転、それ以外は押し出しをすすめる
    const hasAxis = sk.entities.some((e) => e.type === "line" && e.construction);
    if (regions > 0 && !used) (hasAxis ? startRevolve : startExtrude)(sk.id);
    else if (regions === 0) toast("閉じた形がないので、まだ立体にはできません");
  };

  const exportStep = async () => {
    const buf = await clientRef.current?.exportSTEP();
    if (!buf) return toast("書き出す立体がありません", "error");
    downloadFile(buf, `${s.doc.name || "作品"}.step`, "application/step");
    toast("STEP を書き出しました。Onshape や SolidWorks、Fusion で開けます");
  };

  const toggleEdge = (mid: Vec3) => {
    const op = s.draftOp;
    if (op?.type !== "fillet") return;
    const near = (e: EdgeRef) => Math.hypot(e.mid[0] - mid[0], e.mid[1] - mid[1], e.mid[2] - mid[2]) < 1e-3;
    updateOp({ edges: op.edges.some(near) ? op.edges.filter((e) => !near(e)) : [...op.edges, { mid }] });
  };
  const filletPicking = mode === "op" && s.draftOp?.type === "fillet" && !s.opPreview;

  const exportStl = async () => {
    const buf = await clientRef.current?.exportSTL();
    if (!buf) return toast("書き出す立体がありません", "error");
    downloadFile(buf, `${s.doc.name || "作品"}.stl`, "model/stl");
    toast("STL を書き出しました。3Dプリンターのソフトで開けます");
  };

  const saveFile = () => {
    downloadFile(JSON.stringify(s.doc, null, 1), `${s.doc.name || "作品"}.scad.json`, "application/json");
  };

  const openFile = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as unknown;
      if (!isDoc(doc)) throw new Error();
      replaceDoc(doc as CadDocument);
      toast(`「${(doc as CadDocument).name}」を開きました`);
    } catch {
      toast("このファイルは開けませんでした", "error");
    }
  };

  const newDoc = () => {
    if (s.doc.features.length > 0 && !window.confirm("いまの作品を閉じて、新しく始めますか?(元の作品は「もどす」ではもどせません。先に保存しておくと安心です)")) return;
    replaceDoc(emptyDocument());
  };

  const sketchFeature = s.draftSketch;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // かいたものがあれば、捨てる前に確認する(「かけた!」のとなりなので押しまちがえやすい)
  const cancelSketch = () => {
    const changed = s.sketchPast.length > 0 || (s.mode.kind === "sketch" && s.mode.isNew && (sketchFeature?.entities.length ?? 0) > 0);
    if (changed) setConfirmDiscard(true);
    else cancelMode();
  };
  // スケッチ平面の上にある立体の輪郭(下がき)。面にかくとき、どこにかけばよいか分かるように
  const mesh = s.result?.mesh ?? null;
  const plane = sketchFeature?.plane;
  const references = useMemo(() => (plane && mesh ? edgesOnPlane(mesh.edges, resolvePlane(plane)) : EMPTY), [plane, mesh]);

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        {mode === "sketch" && sketchFeature ? (
          <>
            <span className="topbar-title">✏️ {sketchFeature.name}</span>
            <div className="topbar-group">
              <button type="button" onClick={undo} disabled={!canUndo} aria-label="もどす" data-testid="undo">
                ↶ もどす
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} aria-label="やりなおす" data-testid="redo">
                ↷
              </button>
            </div>
            <div className="topbar-group end">
              <button type="button" onClick={cancelSketch} data-testid="sketch-cancel">
                やめる
              </button>
              <button type="button" className="primary" onClick={onFinishSketch} data-testid="sketch-done">
                ✓ かけた!
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              key={s.doc.name}
              className="doc-name"
              aria-label="作品の名前"
              defaultValue={s.doc.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== s.doc.name) renameDoc(v);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <div className="topbar-group">
              <button type="button" onClick={undo} disabled={!canUndo} data-testid="undo">
                ↶ もどす
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} aria-label="やりなおす" data-testid="redo">
                ↷
              </button>
            </div>
            <div className="topbar-group end">
              <span className="save-state" data-testid="save-state">
                {s.busy || !ready ? "⏳ 計算中…" : savedDoc === s.doc ? "✓ 保存ずみ" : "保存中…"}
              </span>
              <button type="button" onClick={newDoc} disabled={mode !== "model"}>
                新しく
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={mode !== "model"}>
                ひらく
              </button>
              <button type="button" onClick={saveFile} disabled={mode !== "model"} data-testid="save-file">
                ファイルに保存
              </button>
              <label className="toggle" title="専門用語(Onshape/SolidWorks と同じ言葉)で表示する">
                <input type="checkbox" checked={pro} onChange={(e) => setProTerms(e.target.checked)} data-testid="pro-terms" />
                専門用語
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}
      </header>

      <main className="workspace">
        {mode !== "sketch" && (
          <FeatureTree
            doc={s.doc}
            statuses={statuses}
            selected={s.selectedFeature}
            pro={pro}
            disabled={mode !== "model"}
            onSelect={(id) => setState({ selectedFeature: id })}
            onEdit={editFeature}
            onDelete={deleteFeature}
          />
        )}

        <div className="stage">
          <div className="stage-3d" hidden={mode === "sketch"}>
            <Viewer3D
              mesh={s.result?.mesh ?? null}
              sketches={s.result?.sketches ?? []}
              picking={mode === "pickPlane"}
              onPick={onPick}
              onMessage={(t) => toast(t)}
              ghost={mode === "op" && s.draftOp?.type !== "fillet"}
              edgePick={filletPicking && s.draftOp?.type === "fillet" ? { selected: s.draftOp.edges.map((e) => e.mid), onToggle: toggleEdge } : null}
            />
          </div>

          {mode === "sketch" && sketchFeature && gcs && (
            <SketchEditor
              key={sketchFeature.id}
              sketch={sketchFeature}
              gcs={gcs}
              pro={pro}
              references={references}
              onEdit={editSketch}
              onPreview={previewSketch}
              onMessage={(text, kind) => toast(text, kind)}
            />
          )}
          {mode === "sketch" && !gcs && <p className="loading">準備しています…</p>}

          {mode === "pickPlane" && (
            <div className="panel plane-panel" role="dialog" aria-label="かく面をえらぶ">
              <h3>どこに絵をかきますか?</h3>
              <div className="plane-buttons">
                {(Object.keys(BASE_PLANE_LABELS) as BasePlaneName[]).map((n) => (
                  <button key={n} type="button" data-testid={`plane-${n}`} onClick={() => startSketch({ kind: "base", name: n })}>
                    {BASE_PLANE_LABELS[n]}
                  </button>
                ))}
              </div>
              {hasBody && (
                <p className="plane-hint" data-testid="face-hint">
                  👆 立体の平らな面をタップすると、その面にかけます(指した面がオレンジになります)
                </p>
              )}
              <button type="button" onClick={cancelMode}>
                やめる
              </button>
            </div>
          )}

          {mode === "op" && s.draftOp && (
            <OpPanel
              doc={s.doc}
              draft={s.draftOp}
              pro={pro}
              error={opError}
              busy={s.busy}
              preview={s.opPreview}
              onPreview={setOpPreview}
              onChange={updateOp}
              onOk={finishOp}
              onCancel={cancelMode}
            />
          )}
        </div>
      </main>

      {mode === "model" && (
        <nav className="stepbar" aria-label="作り方の手順">
          <button type="button" className="step" onClick={startPickPlane} data-testid="new-sketch">
            <span className="step-num">1</span>✏️ {term("newSketch", pro)}
          </button>
          <span className="step-arrow" aria-hidden>
            ▶
          </span>
          <div className="step-group">
            <span className="step-num">2</span>
            <button type="button" className="step" onClick={() => startExtrude()} data-testid="new-extrude">
              🧊 {term("extrude", pro)}
            </button>
            <button type="button" className="step" onClick={() => startRevolve()} data-testid="new-revolve">
              🔄 {term("revolveName", pro)}
            </button>
            <button type="button" className="step" onClick={() => startFillet()} data-testid="new-fillet">
              ◜ {term("fillet", pro)}
            </button>
          </div>
          <span className="step-arrow" aria-hidden>
            ▶
          </span>
          <div className="step-group">
            <span className="step-num">3</span>
            <button type="button" className="step" onClick={exportStl} disabled={!hasBody || s.busy} data-testid="export-stl">
              🖨️ STL
            </button>
            <button type="button" className="step" onClick={exportStep} disabled={!hasBody || s.busy} data-testid="export-step">
              📐 STEP
            </button>
          </div>
        </nav>
      )}

      {confirmDiscard && (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setConfirmDiscard(false)}>
          <div className="dialog" role="dialog" aria-label="かいた絵を捨てる確認">
            <h3>かいた絵を捨てますか?</h3>
            <p className="muted">捨てると、このスケッチでかいたものは元にもどせません。</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirmDiscard(false)} data-testid="discard-keep">
                かきつづける
              </button>
              <button
                type="button"
                className="danger"
                data-testid="discard-ok"
                onClick={() => {
                  setConfirmDiscard(false);
                  cancelMode();
                }}
              >
                捨てる
              </button>
            </div>
          </div>
        </div>
      )}

      {s.toast && (
        <div className={`toast ${s.toast.kind}`} role="status" data-testid="toast">
          {s.toast.text}
        </div>
      )}
    </div>
  );
}
