// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import type { CheckResult, Measure } from "../doc/assignment";
import type { CadDocument } from "../doc/types";
import { buildSheet, sheetToSVG } from "../drawing/sheet";
import { makeSubmission, submissionName, type Student } from "../export/submission";
import type { CadClient } from "./cadClient";
import { downloadFile } from "./persist";
import { toast } from "./store";
import { snapshot3D } from "./Viewer3D";

const STUDENT_KEY = "student-cad:student";
const AUTHOR_KEY = "student-cad:author";

function readStudent(): Student {
  try {
    const s = JSON.parse(localStorage.getItem(STUDENT_KEY) ?? "null") as Student | null;
    if (s) return s;
    return { klass: "", number: "", name: localStorage.getItem(AUTHOR_KEY) ?? "" };
  } catch {
    return { klass: "", number: "", name: "" };
  }
}

function saveStudent(s: Student) {
  try {
    localStorage.setItem(STUDENT_KEY, JSON.stringify(s));
    // 図面の表題欄の名前にも使う
    localStorage.setItem(AUTHOR_KEY, s.name);
  } catch {
    // 保存できなくても、その場では使える
  }
}

interface Props {
  client: CadClient;
  doc: CadDocument;
  checks: CheckResult[];
  measure: Measure | null;
  onClose: () => void;
}

/** 提出用ファイル(ZIP)を作る画面。組・番号・名前は端末に覚えておく */
export function SubmitDialog({ client, doc, checks, measure, onClose }: Props) {
  const [student, setStudent] = useState(readStudent);
  const [working, setWorking] = useState(false);
  const missing = !student.klass.trim() || !student.number.trim() || !student.name.trim();
  const notYet = checks.filter((c) => !c.ok);

  const set = (p: Partial<Student>) => setStudent((s) => ({ ...s, ...p }));

  const submit = async () => {
    setWorking(true);
    saveStudent(student);
    try {
      const [stl, views] = await Promise.all([client.exportSTL(), client.drawing("thirdAngle", true)]);
      const drawingSvg = views ? sheetToSVG(buildSheet(views, { kind: "thirdAngle", title: doc.name, author: student.name, dimensions: true })) : null;
      const bytes = makeSubmission({ doc, student, stl, drawingSvg, image: snapshot3D(), checks, measure });
      downloadFile(bytes as BlobPart, submissionName(student, doc.name), "application/zip");
      toast("提出用ファイルを作りました。先生の言う場所(Classroom など)に出してください");
      onClose();
    } catch {
      toast("提出用ファイルを作れませんでした", "error");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog submit-dialog" role="dialog" aria-label="提出用ファイルを作る">
        <h3>提出用ファイルを作る</h3>
        <p className="muted">作品・STL・図面・見た目の絵・提出カードを1つのファイル(ZIP)にまとめます。</p>
        <div className="submit-fields">
          <label className="field">
            組
            <input value={student.klass} onChange={(e) => set({ klass: e.target.value })} placeholder="例: 2-3" data-testid="submit-class" />
          </label>
          <label className="field">
            番号
            <input value={student.number} inputMode="numeric" onChange={(e) => set({ number: e.target.value })} placeholder="例: 12" data-testid="submit-number" />
          </label>
          <label className="field grow">
            名前
            <input value={student.name} onChange={(e) => set({ name: e.target.value })} placeholder="例: 技術 太郎" data-testid="submit-name" />
          </label>
        </div>
        {doc.assignment && notYet.length > 0 && (
          <div className="panel-warning" data-testid="submit-not-yet">
            まだできていない条件があります: {notYet.map((c) => c.label).join("、")}
            <br />
            このまま提出することもできます。
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button type="button" className="primary" disabled={missing || working} onClick={() => void submit()} data-testid="submit-ok">
            {working ? "作っています…" : "提出用ファイルを作る"}
          </button>
        </div>
        {missing && <p className="muted">組・番号・名前を入れてください(次からは覚えています)</p>}
      </div>
    </div>
  );
}
