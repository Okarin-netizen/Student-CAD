// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawingKind, ProjectedView } from "../kernel/projection";
import { KIND_LABELS, PAPER, TITLE_BLOCK, buildSheet, formatMm, laserDXF, sheetToDXF, sheetToSVG, type SheetSnap } from "../drawing/sheet";
import { newId } from "../doc/ids";
import type { CadClient } from "./cadClient";
import { downloadFile } from "./persist";
import { setAuthor, setDrawingNotes, toast, useStore } from "./store";
import { authorLabel, emptyAuthor, fileBaseName, isStudentId } from "./author";
import { Icon } from "./Icon";
import { TitleBlockDialog } from "./TitleBlockDialog";

interface Props {
  client: CadClient;
  /** 作品名(表題欄と、ファイルの名前に使う) */
  title: string;
  /** 形が変わったら図をかき直すための目印 */
  version: unknown;
  onClose: () => void;
}

const MATERIAL_KEY = "student-cad:material";

const KINDS: { kind: DrawingKind; label: string; hint: string }[] = [
  { kind: "thirdAngle", label: "第三角法", hint: "正面図・平面図・右側面図の3つで、形を正確に表します" },
  { kind: "isometric", label: "等角図", hint: "3本の軸を 120° ずつにして、立体の感じが分かるようにかきます" },
  { kind: "cabinet", label: "キャビネット図", hint: "正面はそのままの形で、奥行きを 45° に半分の長さでかきます" },
];

function readSaved(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function saveLocal(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // 保存できなくても、その場では使える
  }
}

/** 表題欄の日付(例 "2026/11/05") */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** 図面の画面。立体から図をかいて、SVG・DXF・印刷(PDF)で出せる */
export function DrawingView({ client, title, version, onClose }: Props) {
  const [kind, setKind] = useState<DrawingKind>("thirdAngle");
  const [hidden, setHidden] = useState(true);
  const [dims, setDims] = useState(true);
  const [withIso, setWithIso] = useState(true);
  const [material, setMaterial] = useState(() => readSaved(MATERIAL_KEY));
  const [views, setViews] = useState<ProjectedView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const notes = useStore((s) => s.drawing);
  const who = useStore((s) => s.meta.author) ?? emptyAuthor();
  const author = authorLabel(who);
  /** 寸法を手で直すモード: add = 2つの点をタップして足す、erase = 数字をタップして消す */
  const [edit, setEdit] = useState<"none" | "add" | "erase">("none");
  const [pending, setPending] = useState<SheetSnap | null>(null);
  /** 表題欄(学籍番号・氏名・材料)を入れる画面を出しているか */
  const [askTitle, setAskTitle] = useState(false);
  /**
   * 画面の上で、用紙の 1mm が何 px になっているか。
   * 寸法を足すときの点(●)を、紙を小さくうつしても指で押せる大きさにするために使う(2026-11-11)。
   */
  const paperRef = useRef<HTMLDivElement>(null);
  const [pxPerMm, setPxPerMm] = useState(2);
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth / PAPER.width;
      const h = el.clientHeight / PAPER.height;
      if (w > 0 && h > 0) setPxPerMm(Math.min(w, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 等角図・キャビネット図は、ふつう かくれ線をかかない
  const withHidden = kind === "thirdAngle" && hidden;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client
      .drawing(kind, withHidden)
      .then((v) => alive && setViews(v))
      .catch(() => alive && toast("図をかけませんでした", "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [client, kind, withHidden, version]);

  const sheet = useMemo(
    () =>
      views
        ? buildSheet(kind === "thirdAngle" && !withIso ? views.slice(0, 3) : views, {
            kind,
            title,
            author,
            material,
            date: today(),
            dimensions: kind === "thirdAngle" && dims,
            notes,
          })
        : null,
    [views, kind, title, author, material, dims, withIso, notes],
  );
  const svg = useMemo(() => (sheet ? sheetToSVG(sheet) : ""), [sheet]);
  const canEdit = kind === "thirdAngle" && dims && !!sheet;
  const editing = canEdit ? edit : "none";
  // 画面では枠いっぱいに縮めて見せる(保存・印刷は実際の mm の大きさ)。
  // 寸法を足すときは、吸い付く点(●)と、1つ目にえらんだ点を重ねて見せる(印刷・保存には入らない)
  const displaySvg = useMemo(() => {
    let out = svg.replace('width="297mm" height="210mm"', 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
    if (editing === "add" && sheet) {
      const dot = (p: [number, number], r: number, cls: string) => `<circle class="${cls}" cx="${p[0].toFixed(2)}" cy="${(PAPER.height - p[1]).toFixed(2)}" r="${r}"/>`;
      // 点は画面で直径 14px 以上、えらんだ点は外側に直径 28px の輪をつける(用紙の mm にかえて かく)
      const r = Math.max(1.1, 7 / pxPerMm);
      const marks =
        sheet.snaps.map((sn) => dot(sn.at, r, "snap-dot")).join("") +
        (pending ? dot(pending.at, r * 2, "snap-picked") + dot(pending.at, r, "snap-picked-dot") : "");
      out = out.replace("</svg>", `<g class="edit-only">${marks}</g></svg>`);
    }
    return out;
  }, [svg, editing, sheet, pending, pxPerMm]);
  const whoReady = isStudentId(who.studentId) && !!who.name.trim();
  // ファイル名は「学籍番号_氏名_作品名」。SVG・DXF は図の種類もつける
  const pdfName = fileBaseName(who, title);
  const fileBase = fileBaseName(who, title, KINDS.find((k) => k.kind === kind)!.label);

  /** 印刷(PDF に保存)。PDF のファイル名はページの題名になるので、印刷する間だけ題名をかえる */
  const printSheet = () => {
    if (!isStudentId(who.studentId) || !who.name.trim()) toast("学籍番号(4けた)と氏名を入れると、図面とファイル名に入ります");
    const old = document.title;
    document.title = pdfName;
    const restore = () => {
      document.title = old;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const saveMaterial = (v: string) => {
    setMaterial(v);
    saveLocal(MATERIAL_KEY, v);
  };

  /** タップした所を用紙の座標(mm)にする。tol はタップの ずれをゆるす長さ(mm) */
  const paperPoint = (e: React.PointerEvent<HTMLDivElement>) => {
    const svgEl = e.currentTarget.querySelector("svg");
    const ctm = svgEl?.getScreenCTM();
    if (!svgEl || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { at: [pt.x, PAPER.height - pt.y] as [number, number], tol: 22 / ctm.a };
  };

  const onPaperTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sheet) return;
    const hit = paperPoint(e);
    if (!hit) return;
    const [x, y] = hit.at;
    // 寸法を直していないときに表題欄をタップしたら、学籍番号・氏名・材料を入れる画面を出す
    if (editing === "none") {
      const t = TITLE_BLOCK;
      if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) setAskTitle(true);
      return;
    }
    if (editing === "erase") {
      const pad = hit.tol / 2;
      const found = sheet.dims
        .filter((d) => x >= d.box.min[0] - pad && x <= d.box.max[0] + pad && y >= d.box.min[1] - pad && y <= d.box.max[1] + pad)
        .sort((p, q) => (p.box.max[0] - p.box.min[0]) * (p.box.max[1] - p.box.min[1]) - (q.box.max[0] - q.box.min[0]) * (q.box.max[1] - q.box.min[1]))[0];
      if (!found) return toast("消したい寸法の数字をタップしてください");
      setDrawingNotes(found.manual ? { ...notes, added: notes.added.filter((d) => d.id !== found.id) } : { ...notes, hidden: [...notes.hidden, found.id] });
      return toast("寸法を消しました");
    }
    // 足すとき: いちばん近い点に吸い付く
    let best: SheetSnap | null = null;
    let bestD = hit.tol;
    for (const sn of sheet.snaps) {
      const d = Math.hypot(sn.at[0] - x, sn.at[1] - y);
      if (d < bestD) [best, bestD] = [sn, d];
    }
    if (!best) return toast("図の点(●)の近くをタップしてください");
    if (!pending || pending.view !== best.view) {
      if (pending) toast("同じ図の中で、2つの点をえらんでください");
      return setPending(best);
    }
    const dx = Math.abs(best.at[0] - pending.at[0]);
    const dy = Math.abs(best.at[1] - pending.at[1]);
    if (dx < 0.3 && dy < 0.3) return;
    const dir = dx >= dy ? "h" : "v";
    const value = Math.abs(dir === "h" ? best.p[0] - pending.p[0] : best.p[1] - pending.p[1]);
    setDrawingNotes({ ...notes, added: [...notes.added, { id: newId("dim"), view: pending.view, a: pending.p, b: best.p, dir }] });
    setPending(null);
    toast(`寸法 ${formatMm(value)} を足しました`);
  };

  const toggleEdit = (m: "add" | "erase") => {
    setPending(null);
    setEdit(editing === m ? "none" : m);
  };

  const exportLaser = async () => {
    const v = await client.drawing("thirdAngle", false);
    if (!v) return toast("書き出す立体がありません", "error");
    downloadFile(laserDXF(v[1]), `${fileBaseName(who, title, "レーザー用")}.dxf`, "application/dxf");
    toast("上から見た形を 1:1 の DXF にしました。レーザー加工機のソフトで開けます");
  };

  return (
    <div className="drawing-view" role="dialog" aria-label="図面">
      <div className="drawing-toolbar">
        <button type="button" onClick={onClose} data-testid="drawing-close">
          <Icon name="back" /> 3D にもどる
        </button>
        <div className="segmented drawing-kinds" role="radiogroup" aria-label="図の種類">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={kind === k.kind ? "active" : ""} onClick={() => setKind(k.kind)} data-testid={`drawing-${k.kind}`}>
              {k.label}
            </button>
          ))}
        </div>
        {kind === "thirdAngle" && (
          <>
            <label className="check">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} data-testid="drawing-hidden" />
              かくれ線
            </label>
            <label className="check">
              <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} data-testid="drawing-dims" />
              寸法
            </label>
            <label className="check">
              <input type="checkbox" checked={withIso} onChange={(e) => setWithIso(e.target.checked)} data-testid="drawing-with-iso" />
              等角図
            </label>
          </>
        )}
        {/* 寸法を足す・消すも同じ段にならべ、紙を大きくうつす(2026-11-10) */}
        {canEdit && (
          <div className="drawing-edit" role="group" aria-label="寸法を直す">
            <button type="button" className={editing === "add" ? "active" : ""} aria-pressed={editing === "add"} onClick={() => toggleEdit("add")} data-testid="dim-add">
              <Icon name="dimension" /> 寸法を足す
            </button>
            <button type="button" className={editing === "erase" ? "active" : ""} aria-pressed={editing === "erase"} onClick={() => toggleEdit("erase")} data-testid="dim-erase">
              <Icon name="cut" /> 消す
            </button>
            {(notes.added.length > 0 || notes.hidden.length > 0) && (
              <button type="button" onClick={() => setDrawingNotes({ hidden: [], added: [] })} data-testid="dim-reset" aria-label="寸法をもとにもどす">
                <Icon name="replay" /> もとにもどす
              </button>
            )}
          </div>
        )}
      </div>

      <p className="drawing-hint">
        {editing === "add"
          ? pending
            ? "2つ目の点をタップしてください。横にはなれていれば横の長さ、たてにはなれていれば たての長さが入ります"
            : "図の点(●)を2つタップすると、その間の寸法が入ります"
          : editing === "erase"
            ? "消したい寸法の数字をタップしてください。消した寸法は「寸法をもとにもどす」で戻せます"
            : `${KINDS.find((k) => k.kind === kind)!.hint}${whoReady ? "" : "。右下の表題欄をタップすると、学籍番号と氏名を入れられます"}`}
      </p>

      <div className={`drawing-paper ${editing !== "none" ? "editing" : ""}`} data-testid="drawing-sheet" ref={paperRef} onPointerUp={onPaperTap}>
        {loading && !sheet && <p className="loading">図をかいています…</p>}
        {!loading && !views && <p className="loading">先に立体を作ってください</p>}
        {sheet && <div className="sheet-print" dangerouslySetInnerHTML={{ __html: displaySvg }} />}
      </div>

      {askTitle && <TitleBlockDialog who={who} material={material} onAuthor={setAuthor} onMaterial={saveMaterial} onClose={() => setAskTitle(false)} />}

      <div className="drawing-actions">
        <span className="muted">
          {KIND_LABELS[kind]} ・ 尺度 {sheet?.scaleLabel ?? "-"} ・ A4 横
        </span>
        {/* 学籍番号・氏名・材料は、このボタンか表題欄のタップで入れる */}
        <button
          type="button"
          className={`drawing-who-button ${whoReady ? "" : "needs"}`}
          onClick={() => setAskTitle(true)}
          data-testid="drawing-who"
        >
          <Icon name="sketch" /> {whoReady ? authorLabel(who) : "学籍番号と氏名"}
        </button>
        <button type="button" disabled={!sheet} onClick={printSheet} data-testid="drawing-print">
          <Icon name="print" /> 印刷 / PDF
        </button>
        <button type="button" disabled={!sheet} onClick={() => downloadFile(svg, `${fileBase}.svg`, "image/svg+xml")} data-testid="drawing-svg">
          SVG
        </button>
        <button type="button" disabled={!sheet} onClick={() => sheet && downloadFile(sheetToDXF(sheet), `${fileBase}.dxf`, "application/dxf")} data-testid="drawing-dxf">
          DXF
        </button>
        <button type="button" disabled={!sheet} onClick={exportLaser} data-testid="drawing-laser">
          レーザー加工用 DXF
        </button>
      </div>
    </div>
  );
}
