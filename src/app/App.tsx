// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useMemo, useRef, useState } from "react";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { planeFromFace } from "../doc/planes";
import { sketchUnderlay } from "./sketch/references";
import type { BasePlaneName, CadDocument, EdgeRef, Vec3 } from "../doc/types";
import { evaluateChecks } from "../doc/assignment";
import type { Template } from "../doc/templates";
import { dist3 } from "../math/vec";
import { CadClient } from "./cadClient";
import { OpPanel } from "./OpPanel";
import { FeatureTree } from "./FeatureTree";
import { downloadFile, isDoc, loadDoc, saveDoc } from "./persist";
import { SketchEditor } from "./sketch/SketchEditor";
import {
  cancelMode,
  deleteFeature,
  docForSave,
  setAssignment,
  setReplayStep,
  startReplay,
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
  getState,
  setOpPreview,
  startExtrude,
  startDrawing,
  startFillet,
  startMirror,
  startPattern,
  startLoft,
  startShell,
  startSweep,
  startRevolve,
  startPickPlane,
  startSketch,
  toast,
  undo,
  updateOp,
  useStore,
} from "./store";
import { term } from "./terms";
import { Viewer3D, faceGroupAt, type PickResult } from "./Viewer3D";
import { VariablesPanel } from "./VariablesPanel";
import { DrawingView } from "./DrawingView";
import { AssignmentCard, AssignmentEditor } from "./AssignmentPanel";
import { SubmitDialog } from "./SubmitDialog";
import { ReplayBar } from "./ReplayBar";
import { NewDialog } from "./NewDialog";
import { Icon } from "./Icon";
import { TipLayer } from "./TipLayer";
import type { PadVariable } from "./NumberPad";
import { DropMenu, type MenuItem } from "./DropMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { PlanePanel } from "./PlanePanel";
import { nextStepAfterSketch } from "./nextStep";
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
  const [showVariables, setShowVariables] = useState(false);
  const [dialog, setDialog] = useState<"new" | "assignment" | "submit" | null>(null);
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
    const save = () => saveDoc(docForSave(getState())).then((ok) => ok && setSavedDoc(doc));
    const t = setTimeout(save, 300);
    // タブを閉じる・アプリを切り替えるときは、待たずに保存する
    const now = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", now);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", now);
    };
  }, [s.doc, s.drawing, s.meta.author, loaded]);

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

  // 数字キーパッドで使える変数(計算できたものだけ)
  const padVariables = useMemo<PadVariable[]>(() => (s.doc.variables ?? []).map((v) => ({ name: v.name, value: v.value })), [s.doc.variables]);

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
  const opWarning = (() => {
    const st = s.draftOp && statuses.find((x) => x.id === s.draftOp!.id);
    return st && st.ok ? st.warning : undefined;
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
    const next = nextStepAfterSketch(s.doc, sk);
    if (next.kind === "loft") startLoft();
    else if (next.kind === "sweep") startSweep();
    else if (next.kind === "revolve") startRevolve(sk.id);
    else if (next.kind === "extrude") startExtrude(sk.id);
    else if (next.kind === "hint") toast(next.text);
  };

  const toggleEdge = (mid: Vec3) => {
    const op = s.draftOp;
    if (op?.type !== "fillet") return;
    const near = (e: EdgeRef) => dist3(e.mid, mid) < 1e-3;
    updateOp({ edges: op.edges.some(near) ? op.edges.filter((e) => !near(e)) : [...op.edges, { mid }] });
  };
  const filletPicking = mode === "op" && s.draftOp?.type === "fillet" && !s.opPreview;

  /** くりぬく面をえらぶ / はずす(同じ面をもう一度タップしたら、はずす) */
  const toggleFace = (point: Vec3, normal: Vec3) => {
    const op = s.draftOp;
    const m = s.result?.mesh;
    if (op?.type !== "shell" || !m) return;
    const g = faceGroupAt(m, point);
    const same = op.faces.filter((f) => faceGroupAt(m, f.point) === g);
    updateOp({ faces: same.length ? op.faces.filter((f) => !same.includes(f)) : [...op.faces, { point, normal }] });
  };
  const shellPicking = mode === "op" && s.draftOp?.type === "shell" && !s.opPreview;
  /** 基準面をずらす量(mm)。0 ならそのままの基準面にかく */
  const [planeOffset, setPlaneOffset] = useState(0);
  const pickBase = (name: BasePlaneName) => {
    startSketch(planeOffset > 0 ? { kind: "offset", base: name, distance: planeOffset } : { kind: "base", name });
    setPlaneOffset(0);
  };

  /** 立体をファイルに書き出す。make は Worker に作らせる関数、done は書き出せたときの案内 */
  const exportBody = async (make: (c: CadClient) => Promise<ArrayBuffer | null | undefined>, ext: string, mime: string, done: string) => {
    const client = clientRef.current;
    const buf = client && (await make(client));
    if (!buf) return toast("書き出す立体がありません", "error");
    downloadFile(buf, `${s.doc.name || "作品"}.${ext}`, mime);
    toast(done);
  };

  const saveFile = () => {
    downloadFile(JSON.stringify(docForSave(s), null, 1), `${s.doc.name || "作品"}.scad.json`, "application/json");
  };

  /** 課題ファイル: 作品の記録(作業時間など)は入れず、生徒が開いたときに新しく数え始める */
  const exportAssignment = (a: NonNullable<CadDocument["assignment"]>) => {
    const doc: CadDocument = { ...s.doc, assignment: a };
    downloadFile(JSON.stringify(doc, null, 1), `課題_${a.title}.scad.json`, "application/json");
    toast("課題ファイルを保存しました。生徒はこのファイルを「ひらく」で開きます");
  };

  // 課題の条件(形が計算し直されるたびに確かめ直す)
  const checks = useMemo(() => evaluateChecks(s.doc, s.result?.measure ?? null), [s.doc, s.result]);

  const openFile = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as unknown;
      if (!isDoc(doc)) throw new Error();
      replaceDoc(doc as CadDocument);
      const a = (doc as CadDocument).assignment;
      toast(a ? `課題「${a.title}」を開きました。右上の課題カードを見ながら作りましょう` : `「${(doc as CadDocument).name}」を開きました`);
    } catch {
      toast("このファイルは開けませんでした", "error");
    }
  };

  const startFrom = (t: Template) => {
    replaceDoc(t.make());
    setDialog(null);
    if (t.id !== "blank") toast(`課題「${t.label}」を始めました。右上の課題カードを見ながら作りましょう`);
  };

  // ---- メニューの中身 ----

  const fileMenu: MenuItem[] = [
    { id: "file-new", icon: "plus", label: "新しく", run: () => setDialog("new") },
    { id: "file-open", icon: "open", label: "ひらく", run: () => fileRef.current?.click() },
    { id: "save-file", icon: "save", label: "ファイルに保存", run: saveFile },
    { id: "file-assignment", icon: "assignment", label: s.doc.assignment ? "課題をなおす(先生用)" : "課題を作る(先生用)", run: () => setDialog("assignment") },
  ];

  /** 「そのほか」の作業(対称・ならべる・つなぐ・なぞる・くりぬく) */
  const moreMenu: MenuItem[] = [
    { id: "new-mirror", icon: "mirror", label: term("mirror", pro), desc: "立体を鏡に写して、左右対称などにする", run: startMirror },
    { id: "new-pattern", icon: "pattern", label: term("pattern", pro), desc: "穴などを、まっすぐや円のまわりにならべる", run: startPattern },
    { id: "new-loft", icon: "loft", label: term("loft", pro), desc: "高さのちがう面にかいた形を、なめらかにつなぐ", run: startLoft },
    { id: "new-sweep", icon: "sweep", label: term("sweep", pro), desc: "断面の形を、線(道すじ)にそって動かす(取っ手・パイプ・リング)", run: startSweep },
    { id: "new-shell", icon: "shell", label: term("shell", pro), desc: "面を1つ取りのぞいて、中をからにする(ペン立て・コップ)", run: startShell },
  ];

  const exportMenu: MenuItem[] = [
    {
      id: "export-stl",
      icon: "cube",
      label: "STL",
      desc: "3Dプリンターのソフトで開く(いちばん多く使われる形式)",
      run: () => exportBody((c) => c.exportSTL(), "stl", "model/stl", "STL を書き出しました。3Dプリンターのソフトで開けます"),
    },
    {
      id: "export-3mf",
      icon: "layers",
      label: "3MF",
      desc: "新しい3Dプリンターのソフト(Bambu Studio・PrusaSlicer など)で開く",
      run: () =>
        exportBody((c) => c.export3MF(s.doc.name || "作品"), "3mf", "model/3mf", "3MF を書き出しました。新しい3Dプリンターのソフト(Bambu Studio・PrusaSlicer など)で開けます"),
    },
    {
      id: "export-step",
      icon: "drawing",
      label: "STEP",
      desc: "Onshape・SolidWorks・Fusion などの CAD で開く",
      run: () => exportBody((c) => c.exportSTEP(), "step", "application/step", "STEP を書き出しました。Onshape や SolidWorks、Fusion で開けます"),
    },
  ];

  const sketchFeature = s.draftSketch;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // かいたものがあれば、捨てる前に確認する(「かけた!」のとなりなので押しまちがえやすい)
  const cancelSketch = () => {
    const changed = s.sketchPast.length > 0 || (s.mode.kind === "sketch" && s.mode.isNew && (sketchFeature?.entities.length ?? 0) > 0);
    if (changed) setConfirmDiscard(true);
    else cancelMode();
  };
  // スケッチ平面の上にある立体の輪郭など(下がき)。面にかくとき、どこにかけばよいか分かるように
  const mesh = s.result?.mesh ?? null;
  const plane = sketchFeature?.plane;
  const sketchDisplays = s.result?.sketches;
  const draftId = sketchFeature?.id;
  const references = useMemo(
    () => (plane ? sketchUnderlay(plane, mesh, sketchDisplays ?? [], s.doc.features, draftId) : EMPTY),
    [plane, mesh, sketchDisplays, draftId, s.doc.features],
  );

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        {mode === "sketch" && sketchFeature ? (
          <>
            <span className="topbar-title"><Icon name="sketch" /> {sketchFeature.name}</span>
            <div className="topbar-group">
              <button type="button" onClick={undo} disabled={!canUndo} aria-label="もどす" data-testid="undo">
                <Icon name="undo" /> もどす
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} aria-label="やりなおす" data-testid="redo">
                <Icon name="redo" />
              </button>
            </div>
            <div className="topbar-group end">
              <button type="button" onClick={cancelSketch} data-testid="sketch-cancel">
                やめる
              </button>
              <button type="button" className="primary" onClick={onFinishSketch} data-testid="sketch-done">
                <Icon name="check" /> かけた!
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
                // 空にしたときは名前を変えないので、入力欄も元の名前にもどす
                else e.target.value = s.doc.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <div className="topbar-group">
              <button type="button" onClick={undo} disabled={!canUndo} data-testid="undo">
                <Icon name="undo" /> もどす
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} aria-label="やりなおす" data-testid="redo">
                <Icon name="redo" />
              </button>
            </div>
            <div className="topbar-group end">
              <span className="save-state" data-testid="save-state">
                {s.busy || !ready ? "計算中…" : savedDoc === s.doc ? "保存ずみ" : "保存中…"}
              </span>
              <button type="button" onClick={() => setShowVariables(true)} disabled={mode !== "model"} data-testid="open-variables">
                <Icon name="variables" /> {term("variables", pro)}
              </button>
              <DropMenu icon="folder" label="ファイル" testId="open-file-menu" disabled={mode !== "model"} menuLabel="ファイル" menuClass="file-menu" items={fileMenu} closeKey={mode} />
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
            replayStep={s.mode.kind === "replay" ? s.mode.step : null}
            onReplay={startReplay}
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
              ghost={mode === "op" && s.draftOp?.type !== "fillet" && s.draftOp?.type !== "shell"}
              edgePick={filletPicking && s.draftOp?.type === "fillet" ? { selected: s.draftOp.edges.map((e) => e.mid), onToggle: toggleEdge } : null}
              facePick={shellPicking && s.draftOp?.type === "shell" ? { selected: s.draftOp.faces.map((f) => f.point), onToggle: toggleFace } : null}
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
              variables={padVariables}
            />
          )}
          {mode === "sketch" && !gcs && <p className="loading">準備しています…</p>}

          {s.doc.assignment && mode === "model" && <AssignmentCard assignment={s.doc.assignment} results={checks} />}

          {mode === "pickPlane" && (
            <PlanePanel offset={planeOffset} onOffset={setPlaneOffset} hasBody={hasBody} variables={padVariables} onPick={pickBase} onCancel={cancelMode} />
          )}

          {mode === "op" && s.draftOp && (
            <OpPanel
              doc={s.doc}
              draft={s.draftOp}
              pro={pro}
              error={opError}
              warning={opWarning}
              busy={s.busy}
              preview={s.opPreview}
              variables={padVariables}
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
            <span className="step-num">1</span><Icon name="sketch" /> {term("newSketch", pro)}
          </button>
          <span className="step-arrow" aria-hidden>
            <Icon name="chevron" />
          </span>
          <div className="step-group">
            <span className="step-num">2</span>
            <button type="button" className="step" onClick={() => startExtrude()} data-testid="new-extrude">
              <Icon name="extrude" /> {term("extrude", pro)}
            </button>
            <button type="button" className="step" onClick={() => startRevolve()} data-testid="new-revolve">
              <Icon name="revolve" /> {term("revolveName", pro)}
            </button>
            <button type="button" className="step" onClick={() => startFillet()} data-testid="new-fillet">
              <Icon name="fillet" /> {term("fillet", pro)}
            </button>
            <DropMenu icon="more" label="そのほか" testId="open-more" buttonClass="step" menuLabel="そのほかの作業" menuClass="more-menu" items={moreMenu} closeKey={mode} />
          </div>
          <span className="step-arrow" aria-hidden>
            <Icon name="chevron" />
          </span>
          <div className="step-group">
            <span className="step-num">3</span>
            <DropMenu icon="export" label="書き出す" testId="open-export" buttonClass="step" disabled={!hasBody || s.busy} menuLabel="書き出す" items={exportMenu} closeKey={mode} />
            <button type="button" className="step" onClick={startDrawing} disabled={!hasBody || s.busy} data-testid="open-drawing">
              <Icon name="drawing" /> 図面
            </button>
            <button type="button" className="step" onClick={() => setDialog("submit")} disabled={!hasBody || s.busy} data-testid="open-submit">
              <Icon name="submit" /> 提出
            </button>
          </div>
        </nav>
      )}

      {s.mode.kind === "replay" && (
        <ReplayBar features={s.doc.features} step={s.mode.step} busy={s.busy} onStep={setReplayStep} onClose={cancelMode} />
      )}

      <TipLayer />

      {dialog === "new" && <NewDialog hasWork={s.doc.features.length > 0} onPick={startFrom} onClose={() => setDialog(null)} />}
      {dialog === "assignment" && (
        <AssignmentEditor initial={s.doc.assignment} onSave={setAssignment} onExport={exportAssignment} onClose={() => setDialog(null)} />
      )}
      {dialog === "submit" && clientRef.current && (
        <SubmitDialog client={clientRef.current} doc={docForSave(s)} checks={checks} measure={s.result?.measure ?? null} onClose={() => setDialog(null)} />
      )}

      {mode === "drawing" && clientRef.current && (
        <DrawingView client={clientRef.current} title={s.doc.name} version={s.result} onClose={cancelMode} />
      )}

      {showVariables && <VariablesPanel doc={s.doc} pro={pro} onClose={() => setShowVariables(false)} />}

      {confirmDiscard && (
        <ConfirmDialog
          label="かいた絵を捨てる確認"
          title="かいた絵を捨てますか?"
          cancelText="かきつづける"
          okText="捨てる"
          cancelTestId="discard-keep"
          okTestId="discard-ok"
          onCancel={() => setConfirmDiscard(false)}
          onOk={() => {
            setConfirmDiscard(false);
            cancelMode();
          }}
        >
          <p className="muted">捨てると、このスケッチでかいたものは元にもどせません。</p>
        </ConfirmDialog>
      )}

      {s.toast && (
        <div className={`toast ${s.toast.kind}`} role="status" data-testid="toast">
          {s.toast.text}
        </div>
      )}
    </div>
  );
}
