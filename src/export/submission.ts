// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 提出用ファイル(ZIP)を作る。
// 中身: 作品ファイル・STL・図面(SVG)・3D の絵(PNG)・提出カード(HTML)。
// 提出カードはブラウザで開くだけで、先生が作品の大きさ・条件・作り方の順番を見られる。

import type { CheckResult, Measure } from "../doc/assignment";
import { fmt } from "../doc/assignment";
import type { CadDocument, Feature } from "../doc/types";
import { makeZip } from "./zip";

export interface Student {
  /** 組(例: "2-3") */
  klass: string;
  /** 出席番号 */
  number: string;
  name: string;
}

export interface SubmissionInput {
  doc: CadDocument;
  student: Student;
  /** STL(バイナリ)。立体がなければ null */
  stl: ArrayBuffer | null;
  /** 第三角法の図面(SVG) */
  drawingSvg: string | null;
  /** 3D の絵(PNG の data URL) */
  image: string | null;
  checks: CheckResult[];
  measure: Measure | null;
  /** 作った時刻(テストのために外から渡せる) */
  now?: Date;
}

/** ファイル名に使えない文字を「_」にする */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "_";
}

/** 提出ファイルの名前。先生が並べたとき組・番号の順になるように「組-番号_名前_作品名」 */
export function submissionName(student: Student, title: string): string {
  const num = student.number.trim().padStart(2, "0");
  return `${safeName(student.klass)}-${safeName(num)}_${safeName(student.name)}_${safeName(title || "作品")}.zip`;
}

export function makeSubmission(input: SubmissionInput): Uint8Array {
  const { doc, student } = input;
  const now = input.now ?? new Date();
  const enc = new TextEncoder();
  const base = safeName(doc.name || "作品");
  const saved: CadDocument & { submission: { student: Student; submittedAt: string } } = {
    ...doc,
    submission: { student, submittedAt: now.toISOString() },
  };
  const files: { name: string; data: Uint8Array }[] = [
    { name: "提出カード.html", data: enc.encode(reportHTML(input, now)) },
    { name: `${base}.scad.json`, data: enc.encode(JSON.stringify(saved, null, 1)) },
  ];
  if (input.stl) files.push({ name: `${base}.stl`, data: new Uint8Array(input.stl) });
  if (input.drawingSvg) files.push({ name: `${base}_図面.svg`, data: enc.encode(input.drawingSvg) });
  if (input.image) files.push({ name: `${base}.png`, data: dataUrlBytes(input.image) });
  return makeZip(files);
}

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 作業時間を「1時間 5分」のように */
export function durationText(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return "1分未満";
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間 ${m % 60}分` : `${m}分`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FEATURE_WORDS: Record<Feature["type"], string> = {
  sketch: "スケッチ",
  extrude: "押し出し",
  revolve: "回転",
  fillet: "角を丸める・落とす",
  mirror: "対称にする",
  pattern: "ならべる",
  loft: "つなぐ",
  shell: "くりぬく",
};

function featureDetail(f: Feature): string {
  switch (f.type) {
    case "sketch":
      return `線や円 ${f.entities.filter((e) => e.type !== "point").length} こ、寸法 ${f.constraints.filter((c) => "value" in c).length} こ`;
    case "extrude":
      return `${f.operation === "cut" ? "けずる" : "くっつける"} ${f.distance}mm`;
    case "revolve":
      return `${f.operation === "cut" ? "けずる" : "くっつける"} ${f.angle}°`;
    case "fillet":
      return `${f.kind === "fillet" ? "R" : "C"}${f.radius} ・ 辺 ${f.edges.length} 本`;
    case "mirror":
      return f.source === "body" ? "立体ぜんぶ" : "作業1つ";
    case "pattern":
      return f.kind === "linear" ? `${f.count}${f.count2 > 1 ? `×${f.count2}` : ""} こ` : `${f.count} こ / ${f.angle}°`;
    case "loft":
      return `${f.operation === "cut" ? "けずる" : "くっつける"} スケッチ ${f.sketchIds.length} こ`;
    case "shell":
      return `あつさ ${f.thickness}mm ・ 面 ${f.faces.length} こ`;
  }
}

/** 提出カード。印刷してもそのまま使えるよう、A4 たてに収まる形にする */
export function reportHTML(input: SubmissionInput, now: Date): string {
  const { doc, student, checks, measure } = input;
  const meta = doc.meta;
  const okCount = checks.filter((c) => c.ok).length;
  const rows: [string, string][] = [
    ["組・番号", `${student.klass} ${student.number}番`],
    ["名前", student.name],
    ["作品名", doc.name],
    ["提出した日時", now.toLocaleString("ja-JP")],
  ];
  if (meta) rows.push(["作業した時間", `${durationText(meta.activeSeconds)}(${new Date(meta.createdAt).toLocaleDateString("ja-JP")} から)`]);
  if (measure) {
    rows.push(["大きさ", `はば ${fmt(measure.size[0])} × 奥行き ${fmt(measure.size[1])} × 高さ ${fmt(measure.size[2])} mm`]);
    rows.push(["体積", `${fmt(measure.volume / 1000)} cm³`]);
  }
  rows.push(["作業の数", `${doc.features.length}`]);

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>提出カード ${esc(student.name)} ${esc(doc.name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;margin:24px auto;max-width:720px;padding:0 16px;color:#1f2933;background:#fff}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 6px;border-left:4px solid #2f6fdf;padding-left:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd2d9;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f0f4f8;width:9em;font-weight:600}
.ok{color:#1a7f37}.ng{color:#b42318}.muted{color:#616e7c;font-size:13px}img{max-width:100%;border:1px solid #cbd2d9;border-radius:6px;background:#f5f7fa}
ol{padding-left:1.6em}li{margin:2px 0}
</style></head><body>
<h1>提出カード</h1>
<p class="muted">Student CAD で作った作品です。いっしょに入っている .scad.json を Student CAD で開くと、作り方を再生できます。</p>
<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
${input.image ? `<h2>作品の見た目</h2><img src="${input.image}" alt="作品の 3D の絵">` : ""}
${
  doc.assignment
    ? `<h2>課題「${esc(doc.assignment.title)}」の条件 ${okCount} / ${checks.length}</h2>
<table>${checks.map((c) => `<tr><td class="${c.ok ? "ok" : "ng"}">${c.ok ? "✓ できた" : "・ まだ"}</td><td>${esc(c.label)}</td><td>${esc(c.detail)}</td></tr>`).join("")}</table>`
    : ""
}
<h2>作り方の順番(れきし)</h2>
<ol>${doc.features.map((f) => `<li>${esc(f.name)} <span class="muted">${esc(FEATURE_WORDS[f.type])} ・ ${esc(featureDetail(f))}</span></li>`).join("")}</ol>
</body></html>
`;
}
