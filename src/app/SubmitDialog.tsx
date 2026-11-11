// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useState } from "react";
import type { CheckResult, Measure } from "../doc/assignment";
import type { Author, CadDocument } from "../doc/types";
import { buildSheet, sheetToSVG } from "../drawing/sheet";
import { makeSubmission, submissionName, } from "../export/submission";
import type { CadClient } from "./cadClient";
import { downloadFile } from "./persist";
import { setAuthor, toast, useStore } from "./store";
import { authorLabel, digitsOnly, isStudentId, readDeviceAuthor } from "./author";
import { snapshot3D } from "./Viewer3D";

interface Props {
  client: CadClient;
  doc: CadDocument;
  checks: CheckResult[];
  measure: Measure | null;
  onClose: () => void;
}

/**
 * 提出用ファイル(ZIP)を作る画面。学籍番号・氏名は作品に保存し、端末にも覚えておく。
 * 2026-11-11 図面の表題欄と同じ「学籍番号・氏名」にした(前は組・番号・名前で、2回ちがう形で入れていた)。
 */
export function SubmitDialog({ client, doc, checks, measure, onClose }: Props) {
  const saved = useStore((s) => s.meta.author);
  const [student, setStudent] = useState<Author>(() => (saved && saved.name ? saved : readDeviceAuthor()));
  const [working, setWorking] = useState(false);
  const missing = !isStudentId(student.studentId) || !student.name.trim();
  const notYet = checks.filter((c) => !c.ok);

  const set = (p: Partial<Author>) => setStudent((s) => ({ ...s, ...p }));

  const submit = async () => {
    setWorking(true);
    setAuthor(student);
    try {
      const [stl, views] = await Promise.all([client.exportSTL(), client.drawing("thirdAngle", true)]);
      const drawingSvg = views ? sheetToSVG(buildSheet(views, { kind: "thirdAngle", title: doc.name, author: authorLabel(student), dimensions: true })) : null;
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
            学籍番号(4けた)
            <input
              value={student.studentId}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => set({ studentId: digitsOnly(e.target.value) })}
              placeholder="例: 2312"
              data-testid="submit-student-id"
            />
          </label>
          <label className="field grow">
            氏名
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
        {missing && <p className="muted">学籍番号(4けた)と氏名を入れてください。図面と同じものが使われ、次からは覚えています</p>}
      </div>
    </div>
  );
}
