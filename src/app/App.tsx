// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { planeFromFace } from "../doc/planes";
import { sketchUnderlay } from "./sketch/references";
import type { BasePlaneName, CadDocument, EdgeRef, Vec3 } from "../doc/types";
import { evaluateChecks } from "../doc/assignment";
import type { Template } from "../doc/templates";
import { dist3 } from "../math/vec";
import type { CadClient } from "./cadClient";
import { OpPanel } from "./OpPanel";
import { FeatureTree } from "./FeatureTree";
import { downloadFile, isDoc } from "./persist";
import { docFileName } from "../util/fileName";
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
  picksOnBody,
  toast,
  undo,
  updateOp,
  useStore,
} from "./store";
import { featureLabel, term } from "./terms";
import { Viewer3D, faceGroupAt, type PickResult } from "./Viewer3D";
import { VariablesPanel } from "./VariablesPanel";
import { DrawingView } from "./DrawingView";
import { AssignmentCard, AssignmentEditor } from "./AssignmentPanel";
import { SubmitDialog } from "./SubmitDialog";
import { ArDialog } from "./ArDialog";
import { ReplayBar } from "./ReplayBar";
import { NewDialog } from "./NewDialog";
import { AboutDialog } from "./AboutDialog";
import { UpdateBanner } from "./UpdateBanner";
import { TopPage, startsAtTop, type SavedWork } from "./TopPage";
import { Icon } from "./Icon";
import { TipLayer } from "./TipLayer";
import type { PadVariable } from "./NumberPad";
import { DropMenu, type MenuItem } from "./DropMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { useDismiss } from "./useDismiss";
import { useScrollHint } from "./useScrollHint";
import { PlanePanel } from "./PlanePanel";
import { nextStepAfterSketch } from "./nextStep";
import { stepGuide, type StepButton } from "./stepGuide";
import { usePanelCover } from "./usePanelCover";
import { useCadEngine } from "./useCadEngine";
import { useAutoSave } from "./useAutoSave";
import { useUndoShortcuts } from "./useUndoShortcuts";
import "./app.css";

const EMPTY = new Float32Array(0);

export function App() {
  const s = useStore((x) => x);
  // 起動の準備(Worker・拘束計算・保存してあった作品)と、自動保存・キーボードは、それぞれのファイルに分けてある
  const { clientRef, gcs, ready, loaded } = useCadEngine();
  const savedDoc = useAutoSave(s, loaded);
  useUndoShortcuts();
  const [showVariables, setShowVariables] = useState(false);
  const [dialog, setDialog] = useState<"new" | "assignment" | "submit" | "ar" | "about" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pro = s.proTerms;
  // トップページを出しているか(2026-11-25)。作業画面は うしろで準備を進めておく
  const [atTop, setAtTop] = useState(startsAtTop);

  // ---- 形の計算: 設計図(編集中のものを含む)が変わるたびに Worker へ ----
  // 角を丸める辺・くりぬく面をえらんでいる間は、えらんだものが変わっても見せる形は同じなので、計算し直さない
  const pickingOnBody = s.mode.kind === "op" && !!s.draftOp && picksOnBody(s.draftOp) && !s.opPreview;
  const opKey = pickingOnBody ? s.draftOp?.id : s.draftOp;
  const preview = useMemo(() => previewDoc(s), [s.doc, s.mode, s.draftSketch, opKey, s.opPreview]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 画面の立体が、いま見せたい形の計算を終えたものか(「辺をえらびなおす」を押した直後は、まだ前の形が出ている) */
  const resultIsCurrent = s.resultDoc === preview;
  useEffect(() => {
    clientRef.current?.request(preview);
  }, [clientRef, preview]);

  // 数字キーパッドで使える変数(計算できたものだけ)
  const padVariables = useMemo<PadVariable[]>(() => (s.doc.variables ?? []).map((v) => ({ name: v.name, value: v.value })), [s.doc.variables]);

  const statuses = s.result?.statuses ?? [];
  const mode = s.mode.kind;
  const canUndo = mode === "sketch" ? s.sketchPast.length > 0 : mode === "model" && s.past.length > 0;
  const canRedo = mode === "sketch" ? s.sketchFuture.length > 0 : mode === "model" && s.future.length > 0;
  const hasBody = !!s.result?.mesh;
  // 設定中の作業(押し出しなど)の計算の結果。うまくいかなければ error、注意があれば warning
  const opStatus = s.draftOp ? statuses.find((x) => x.id === s.draftOp!.id) : undefined;
  const opError = opStatus && !opStatus.ok ? opStatus.error : undefined;
  const opWarning = opStatus?.ok ? opStatus.warning : undefined;

  // 手順バー: 次に押すボタンをみどりに、まだ使えないボタンをうすくする(stepGuide.ts)
  const guide = useMemo(() => stepGuide(s.doc, hasBody, pro), [s.doc, hasBody, pro]);
  /** 手順バーのボタンの class と、押したときの動き(使えないときは案内だけ出す) */
  const stepProps = (b: StepButton, run: () => void) => {
    const why = guide.notReady[b];
    return {
      className: ["step", guide.next === b ? "next" : "", why ? "not-ready" : ""].filter(Boolean).join(" "),
      "aria-disabled": why ? true : undefined,
      onClick: () => (why ? toast(why) : run()),
    };
  };

  // 縦向きの画面で、たたんだ れきしを開いているか(外をタップ・Esc でとじる)
  const [treeOpen, setTreeOpen] = useState(false);
  const treeRef = useDismiss<HTMLDivElement>(treeOpen, () => setTreeOpen(false));

  const saveState = s.busy || !ready ? "busy" : savedDoc === s.doc ? "saved" : "saving";

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
  };
  // 面をえらぶパネルを「やめる」で閉じたときや、立体の面をタップしたときも、ずらす量を 0 にもどす
  // (前に入れた量がのこったまま、次にパネルを開いたときに出てしまっていた。2026-11-13)
  useEffect(() => {
    if (mode !== "pickPlane") setPlaneOffset(0);
  }, [mode]);

  /** 立体をファイルに書き出す。make は Worker に作らせる関数、done は書き出せたときの案内 */
  const exportBody = async (make: (c: CadClient) => Promise<ArrayBuffer | null | undefined>, ext: string, mime: string, done: string) => {
    const client = clientRef.current;
    let buf: ArrayBuffer | null | undefined;
    try {
      buf = client && (await make(client));
    } catch (err) {
      // 書き出しの計算が失敗しても、だまって何も起きないままにしない(2026-11-22)
      console.error(err);
      return toast(`${ext.toUpperCase()} を書き出せませんでした。形を少し変えてから、もう一度ためしてください`, "error");
    }
    if (!buf) return toast("書き出す立体がありません", "error");
    downloadFile(buf, docFileName(s.doc.name, ext), mime);
    toast(done);
  };

  const saveFile = () => {
    downloadFile(JSON.stringify(docForSave(s), null, 1), docFileName(s.doc.name, "scad.json"), "application/json");
  };

  /** 課題ファイル: 作品の記録(作業時間など)は入れず、生徒が開いたときに新しく数え始める */
  const exportAssignment = (a: NonNullable<CadDocument["assignment"]>) => {
    const doc: CadDocument = { ...s.doc, assignment: a };
    downloadFile(JSON.stringify(doc, null, 1), docFileName(`課題_${a.title}`, "scad.json"), "application/json");
    toast("課題ファイルを保存しました。生徒はこのファイルを「ひらく」で開きます");
  };

  // 課題の条件(形が計算し直されるたびに確かめ直す)
  const checks = useMemo(() => evaluateChecks(s.doc, s.result?.measure ?? null), [s.doc, s.result]);

  /** 開こうとしているファイルの作品(いまの作品が消えてよいか確かめている間だけ入る) */
  const [pendingOpen, setPendingOpen] = useState<CadDocument | null>(null);

  const openFile = async (file: File) => {
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      doc = null;
    }
    if (!isDoc(doc)) return toast("このファイルは開けませんでした", "error");
    // いまの作品に作業があれば、閉じてよいか確かめる(だまって入れかわり、「もどす」でももどせなかった。2026-11-21)
    if (getState().doc.features.length > 0) setPendingOpen(doc as CadDocument);
    else applyOpen(doc as CadDocument);
  };

  const applyOpen = (doc: CadDocument) => {
    setPendingOpen(null);
    setAtTop(false);
    replaceDoc(doc);
    const a = doc.assignment;
    toast(a ? `課題「${a.title}」を開きました。右上の課題カードを見ながら作りましょう` : `「${doc.name}」を開きました`);
  };

  const startFrom = (t: Template) => {
    setPendingNew(null);
    setAtTop(false);
    replaceDoc(t.make());
    setDialog(null);
    if (t.id !== "blank") toast(`課題「${t.label}」を始めました。右上の課題カードを見ながら作りましょう`);
  };

  // ---- トップページ ----

  /** トップページで えらんだ ひな形(いまの作品を閉じてよいか確かめている間だけ入る) */
  const [pendingNew, setPendingNew] = useState<Template | null>(null);
  const savedWork: SavedWork = !loaded
    ? { kind: "loading" }
    : s.doc.features.length === 0
      ? { kind: "none" }
      : { kind: "some", name: s.doc.name, steps: s.doc.features.length, assignment: s.doc.assignment?.title };
  const newFromTop = (t: Template) => (s.doc.features.length > 0 ? setPendingNew(t) : startFrom(t));
  /**
   * いまの作品を閉じる前の確認に出す、残し方の案内。
   * トップページには「ファイルに保存」のボタンがないので、先に「つづきから」で開いてもらう(2026-11-25)
   */
  const keepWorkHint = atTop
    ? "「もどす」ではもどせないので、残したいときは先に「つづきから」で開いて「ファイルに保存」してください。"
    : "「もどす」ではもどせないので、残したいときは先に「ファイルに保存」してください。";

  // ---- メニューの中身 ----

  const fileMenu: MenuItem[] = [
    { id: "file-top", icon: "home", label: "トップページへ", run: () => setAtTop(true) },
    { id: "file-new", icon: "plus", label: "新しく作る", run: () => setDialog("new") },
    { id: "file-open", icon: "open", label: "ひらく", run: () => fileRef.current?.click() },
    { id: "save-file", icon: "save", label: "ファイルに保存", run: saveFile },
    { id: "file-assignment", icon: "assignment", label: s.doc.assignment ? "課題をなおす(先生用)" : "課題を作る(先生用)", run: () => setDialog("assignment") },
    // 専門用語の切りかえは、生徒がふだん使わないので「ファイル」の中に置く(2026-11-10)。説明は長押しで出る(tips.ts)
    {
      id: "pro-terms",
      icon: "info",
      label: pro ? "ふだんの言葉にもどす" : "専門用語で表示する",
      run: () => setProTerms(!pro),
    },
    // 版・作った人・ライセンス・オフラインの様子(2026-11-23)
    { id: "file-about", icon: "help", label: "このアプリについて", run: () => setDialog("about") },
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
  /** かいてある絵をなおしているところか(新しくかいているのではない) */
  const editingOld = s.mode.kind === "sketch" && !s.mode.isNew;
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

  // 作業パネル(立体にする・面をえらぶ)が出ている間は、パネルのない所に立体をうつす
  const stageRef = useRef<HTMLDivElement>(null);
  const panelKey = mode === "pickPlane" ? "plane" : mode === "op" && s.draftOp ? `op-${s.draftOp.type}` : null;
  const cover = usePanelCover(stageRef, panelKey);

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        {mode === "sketch" && sketchFeature ? (
          <>
            <span className="topbar-title"><Icon name="sketch" /> {featureLabel(sketchFeature.name, pro)}</span>
            <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} />
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
            {/* 保存のようす。作品の名前のとなりに、しるしをつけて出す(2026-11-10) */}
            <span className={`save-state ${saveState}`} data-testid="save-state">
              {saveState === "saved" && <Icon name="check" size={18} />}
              {/* スマホでは文字をかくし、しるしだけにする(読み上げでは聞こえる) */}
              <span className="save-text">{saveState === "busy" ? "計算中…" : saveState === "saved" ? "保存ずみ" : "保存中…"}</span>
            </span>
            <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} />
            <div className="topbar-group end">
              <button type="button" onClick={() => setShowVariables(true)} disabled={mode !== "model"} data-testid="open-variables">
                <Icon name="variables" /> {term("variables", pro)}
              </button>
              <DropMenu icon="folder" label="ファイル" testId="open-file-menu" disabled={mode !== "model"} menuLabel="ファイル" menuClass="file-menu" items={fileMenu} closeKey={mode} />
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
          <div className={treeOpen ? "tree-wrap open" : "tree-wrap"} ref={treeRef}>
            {/* 縦向きの画面では、れきしをこのボタン1つにたたむ(CSS で縦向きのときだけ出す) */}
            <button type="button" className="tree-toggle" aria-expanded={treeOpen} onClick={() => setTreeOpen((v) => !v)} data-testid="tree-toggle">
              <Icon name="layers" /> {term("history", pro)}
              <span className="tree-count">{s.doc.features.length}</span>
            </button>
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
          </div>
        )}

        <div className="stage" ref={stageRef}>
          <div className="stage-3d" hidden={mode === "sketch"}>
            <Viewer3D
              mesh={s.result?.mesh ?? null}
              sketches={s.result?.sketches ?? []}
              picking={mode === "pickPlane"}
              onPick={onPick}
              onMessage={(t) => toast(t)}
              ghost={mode === "op" && s.draftOp?.type !== "fillet" && s.draftOp?.type !== "shell"}
              cover={cover}
              pickReady={resultIsCurrent}
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
        <StepBarRow nextKey={guide.next}>
          <button type="button" {...stepProps("sketch", startPickPlane)} data-testid="new-sketch">
            <span className="step-num">1</span><Icon name="sketch" /> {term("newSketch", pro)}
          </button>
          <span className="step-arrow" aria-hidden>
            <Icon name="chevron" />
          </span>
          <div className="step-group">
            <span className="step-num">2</span>
            <button type="button" {...stepProps("extrude", () => startExtrude())} data-testid="new-extrude">
              <Icon name="extrude" /> {term("extrude", pro)}
            </button>
            <button type="button" {...stepProps("revolve", () => startRevolve())} data-testid="new-revolve">
              <Icon name="revolve" /> {term("revolveName", pro)}
            </button>
            <button type="button" {...stepProps("fillet", () => startFillet())} data-testid="new-fillet">
              <Icon name="fillet" /> {term("fillet", pro)}
            </button>
            <DropMenu
              icon="more"
              label="そのほか"
              testId="open-more"
              buttonClass="step"
              onNotReady={guide.notReady.more ? () => toast(guide.notReady.more!) : undefined}
              menuLabel="そのほかの作業" menuClass="more-menu" items={moreMenu} closeKey={mode} />
          </div>
          <span className="step-arrow" aria-hidden>
            <Icon name="chevron" />
          </span>
          <div className="step-group">
            <span className="step-num">3</span>
            <DropMenu icon="export" label="書き出す" testId="open-export" buttonClass={guide.next === "export" ? "step next" : "step"} disabled={!hasBody || s.busy} menuLabel="書き出す" items={exportMenu} closeKey={mode} />
            <button type="button" className="step" onClick={startDrawing} disabled={!hasBody || s.busy} data-testid="open-drawing">
              <Icon name="drawing" /> 図面
            </button>
            <button type="button" className="step" onClick={() => setDialog("submit")} disabled={!hasBody || s.busy} data-testid="open-submit">
              <Icon name="submit" /> 提出
            </button>
            {/* 作った立体を、カメラごしに机の上へ実物大で置いて見る(2026-11-20) */}
            <button type="button" className="step" onClick={() => setDialog("ar")} disabled={!hasBody || s.busy} data-testid="open-ar">
              <Icon name="ar" /> ARで見る
            </button>
          </div>
        </StepBarRow>
      )}

      {s.mode.kind === "replay" && (
        <ReplayBar features={s.doc.features} step={s.mode.step} busy={s.busy} pro={pro} onStep={setReplayStep} onClose={cancelMode} />
      )}

      <TipLayer />

      {atTop && (
        <TopPage
          saved={savedWork}
          onContinue={() => setAtTop(false)}
          onNew={newFromTop}
          onOpenFile={() => fileRef.current?.click()}
          onAbout={() => setDialog("about")}
        />
      )}

      {dialog === "new" && <NewDialog hasWork={s.doc.features.length > 0} onPick={startFrom} onClose={() => setDialog(null)} />}
      {dialog === "assignment" && (
        <AssignmentEditor initial={s.doc.assignment} onSave={setAssignment} onExport={exportAssignment} onClose={() => setDialog(null)} />
      )}
      {dialog === "submit" && clientRef.current && (
        <SubmitDialog client={clientRef.current} doc={docForSave(s)} checks={checks} measure={s.result?.measure ?? null} onClose={() => setDialog(null)} />
      )}

      {dialog === "ar" && s.result?.mesh && <ArDialog mesh={s.result.mesh} onClose={() => setDialog(null)} />}
      {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}

      <UpdateBanner />

      {mode === "drawing" && clientRef.current && (
        <DrawingView client={clientRef.current} title={s.doc.name} version={s.result} onClose={cancelMode} />
      )}

      {showVariables && <VariablesPanel doc={s.doc} pro={pro} onClose={() => setShowVariables(false)} />}

      {confirmDiscard && (
        <ConfirmDialog
          label="かいた絵を捨てる確認"
          title={editingOld ? "なおしたところを捨てますか?" : "かいた絵を捨てますか?"}
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
          {/* なおしている途中なら、捨てるのは今回なおしたところだけ(前の絵は残る)。2026-11-21 */}
          <p className="muted">
            {editingOld
              ? `今回なおしたところは元にもどせません。前の${term("sketch", pro)}はそのまま残ります。`
              : `捨てると、この${term("sketch", pro)}でかいたものは元にもどせません。`}
          </p>
        </ConfirmDialog>
      )}

      {pendingNew && (
        <ConfirmDialog
          label="新しく作る確認"
          title={`「${pendingNew.label}」で新しく作りますか?`}
          cancelText="やめる"
          okText="新しく作る"
          cancelTestId="new-cancel"
          okTestId="new-ok"
          onCancel={() => setPendingNew(null)}
          onOk={() => startFrom(pendingNew)}
        >
          <p className="panel-warning">いまの作品「{s.doc.name}」は閉じます。{keepWorkHint}</p>
        </ConfirmDialog>
      )}

      {pendingOpen && (
        <ConfirmDialog
          label="ファイルをひらく確認"
          title={`「${pendingOpen.name}」を開きますか?`}
          cancelText="やめる"
          okText="ひらく"
          cancelTestId="open-cancel"
          okTestId="open-ok"
          onCancel={() => setPendingOpen(null)}
          onOk={() => applyOpen(pendingOpen)}
        >
          <p className="panel-warning">いまの作品「{s.doc.name}」は閉じます。{keepWorkHint}</p>
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

/**
 * 手順バー。タブレットでは ふつうに ならべ、スマホでは1列にして横にスクロールする。
 * 次に押すボタンが画面の外にあれば、見える所まで動かす(2026-11-21 スマホ対応)。
 */
function StepBarRow({ nextKey, children }: { nextKey: unknown; children: ReactNode }) {
  const ref = useScrollHint<HTMLElement>(nextKey, ".step.next");
  return (
    <nav className="stepbar" aria-label="作り方の手順" ref={ref}>
      {children}
    </nav>
  );
}

/** 上のバーの「もどす」「やりなおす」。絵をかいている間も、ふだんの画面でも同じ場所に出す */
function UndoRedoButtons({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) {
  return (
    <div className="topbar-group">
      <button type="button" onClick={undo} disabled={!canUndo} aria-label="もどす" data-testid="undo">
        <Icon name="undo" /> <span className="btn-label">もどす</span>
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-label="やりなおす" data-testid="redo">
        <Icon name="redo" />
      </button>
    </div>
  );
}
