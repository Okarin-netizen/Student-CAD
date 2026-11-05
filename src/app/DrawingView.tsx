// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useMemo, useState } from "react";
import type { DrawingKind, ProjectedView } from "../kernel/projection";
import { KIND_LABELS, buildSheet, laserDXF, sheetToDXF, sheetToSVG } from "../drawing/sheet";
import type { CadClient } from "./cadClient";
import { downloadFile } from "./persist";
import { toast } from "./store";
import { Icon } from "./Icon";

interface Props {
  client: CadClient;
  /** 作品名(表題欄と、ファイルの名前に使う) */
  title: string;
  /** 形が変わったら図をかき直すための目印 */
  version: unknown;
  onClose: () => void;
}

const AUTHOR_KEY = "student-cad:author";
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
  const [author, setAuthor] = useState(() => readSaved(AUTHOR_KEY));
  const [material, setMaterial] = useState(() => readSaved(MATERIAL_KEY));
  const [views, setViews] = useState<ProjectedView[] | null>(null);
  const [loading, setLoading] = useState(true);

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
          })
        : null,
    [views, kind, title, author, material, dims, withIso],
  );
  const svg = useMemo(() => (sheet ? sheetToSVG(sheet) : ""), [sheet]);
  // 画面では枠いっぱいに縮めて見せる(保存・印刷は実際の mm の大きさ)
  const displaySvg = useMemo(() => svg.replace('width="297mm" height="210mm"', 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"'), [svg]);
  const fileBase = `${title || "作品"}_${KINDS.find((k) => k.kind === kind)!.label}`;

  const saveAuthor = (v: string) => {
    setAuthor(v);
    saveLocal(AUTHOR_KEY, v);
  };
  const saveMaterial = (v: string) => {
    setMaterial(v);
    saveLocal(MATERIAL_KEY, v);
  };

  const exportLaser = async () => {
    const v = await client.drawing("thirdAngle", false);
    if (!v) return toast("書き出す立体がありません", "error");
    downloadFile(laserDXF(v[1]), `${title || "作品"}_レーザー用.dxf`, "application/dxf");
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
              等角図もそえる
            </label>
          </>
        )}
        <label className="drawing-author">
          名前
          <input value={author} onChange={(e) => saveAuthor(e.target.value)} placeholder="表題欄に入ります" data-testid="drawing-author" />
        </label>
        <label className="drawing-author">
          材料
          <input value={material} onChange={(e) => saveMaterial(e.target.value)} placeholder="例: PLA、ヒノキ" data-testid="drawing-material" />
        </label>
      </div>

      <p className="drawing-hint">{KINDS.find((k) => k.kind === kind)!.hint}</p>

      <div className="drawing-paper" data-testid="drawing-sheet">
        {loading && !sheet && <p className="loading">図をかいています…</p>}
        {!loading && !views && <p className="loading">先に立体を作ってください</p>}
        {sheet && <div className="sheet-print" dangerouslySetInnerHTML={{ __html: displaySvg }} />}
      </div>

      <div className="drawing-actions">
        <span className="muted">
          {KIND_LABELS[kind]} ・ 尺度 {sheet?.scaleLabel ?? "-"} ・ A4 横
        </span>
        <button type="button" disabled={!sheet} onClick={() => window.print()} data-testid="drawing-print">
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
