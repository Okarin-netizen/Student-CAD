// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { measureVolume, setOC } from "replicad";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { rebuild } from "../../src/kernel/rebuild";
import { checkLabel, evaluateChecks, rangeText } from "../../src/doc/assignment";
import { TEMPLATES } from "../../src/doc/templates";
import { durationText, makeSubmission, reportHTML, safeName, submissionName } from "../../src/export/submission";
import { docWith, rectSketch } from "./fixtures";
import type { CadDocument } from "../../src/doc/types";

let gcs: GcsWrapper;
beforeAll(async () => {
  gcs = await make_gcs_wrapper();
  setOC(await opencascade());
});

const plate = (): CadDocument => ({
  ...docWith(rectSketch(60, 20), { id: "ex1", type: "extrude", name: "板", sketchId: "sk1", distance: 3, operation: "add", flip: false }),
  assignment: {
    title: "名札",
    instructions: "",
    checks: [
      { id: "a", kind: "size", axis: "x", min: 50, max: 80 },
      { id: "b", kind: "size", axis: "z", min: 5 },
      { id: "c", kind: "volume", max: 4 },
      { id: "d", kind: "uses", feature: "fillet" },
      { id: "e", kind: "uses", feature: "extrude" },
    ],
  },
});

describe("課題の条件", () => {
  it("はんいを言葉にする", () => {
    expect(rangeText(50, 60, "mm")).toBe("50〜60 mm");
    expect(rangeText(5, undefined, "mm")).toBe("5 mm 以上");
    expect(rangeText(undefined, 150, "cm³")).toBe("150 cm³ 以下");
    expect(checkLabel({ id: "x", kind: "uses", feature: "text" })).toBe("「文字」を使う");
  });

  it("立体の大きさ・体積・使った作業で、できたかどうかを決める", () => {
    const doc = plate();
    const out = rebuild(doc, gcs);
    const [lo, hi] = out.body!.boundingBox.bounds;
    const measure = { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] as [number, number, number], volume: measureVolume(out.body!) };
    const r = evaluateChecks(doc, measure);
    expect(r.map((x) => x.ok)).toEqual([true, false, true, false, true]);
    expect(r[1].detail).toBe("いまは 3 mm");
    expect(r[2].detail).toBe("いまは 3.6 cm³");
  });

  it("立体がないときは、大きさの条件はまだ", () => {
    const r = evaluateChecks(plate(), null);
    expect(r[0]).toMatchObject({ ok: false, detail: "まだ立体がありません" });
    expect(r[4].ok).toBe(true);
  });
});

describe("課題のひな形", () => {
  it("どのひな形も、そのまま形が作れる(エラーがない)", () => {
    for (const t of TEMPLATES) {
      const doc = t.make();
      const out = rebuild(doc, gcs);
      expect(out.statuses.every((s) => s.ok), t.id).toBe(true);
      if (t.id !== "blank") expect(doc.assignment?.checks.length, t.id).toBeGreaterThan(0);
    }
  });

  it("名札のひな形は 60×20×3 の板から始まり、大きさの条件はもう合っている", () => {
    const doc = TEMPLATES.find((t) => t.id === "nameplate")!.make();
    const out = rebuild(doc, gcs);
    expect(measureVolume(out.body!)).toBeCloseTo(60 * 20 * 3, 3);
  });
});

describe("提出用ファイル", () => {
  const student = { klass: "2-3", number: "5", name: "技術 太郎" };

  it("ファイル名は 組-番号_名前_作品名(番号は2けた、使えない文字は _)", () => {
    expect(submissionName(student, "名札")).toBe("2-3-05_技術_太郎_名札.zip");
    expect(safeName('a/b:c*?"<>|')).toBe("a_b_c");
  });

  it("作業時間を分で書く", () => {
    expect(durationText(20)).toBe("1分未満");
    expect(durationText(25 * 60)).toBe("25分");
    expect(durationText(65 * 60)).toBe("1時間 5分");
  });

  it("ZIP に提出カード・作品ファイル・STL・図面が入り、作品ファイルに名前が入る", () => {
    const doc = { ...plate(), name: "名札", meta: { createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z", activeSeconds: 1800 } };
    const bytes = makeSubmission({
      doc,
      student,
      stl: new Uint8Array([1, 2, 3]).buffer,
      drawingSvg: "<svg/>",
      image: null,
      checks: evaluateChecks(doc, null),
      measure: null,
      now: new Date("2026-11-05T03:00:00Z"),
    });
    const text = new TextDecoder().decode(bytes);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    for (const name of ["提出カード.html", "名札.scad.json", "名札.stl", "名札_図面.svg"]) expect(text).toContain(name);
    expect(text).toContain('"submission"');
    expect(text).toContain("技術 太郎");
  });

  it("提出カードに作業時間・条件・れきしが書かれ、HTML の記号はそのまま表示される", () => {
    const doc = { ...plate(), name: "<名札&>", meta: { createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z", activeSeconds: 1800 } };
    const html = reportHTML({ doc, student, stl: null, drawingSvg: null, image: null, checks: evaluateChecks(doc, null), measure: null }, new Date());
    expect(html).toContain("30分");
    expect(html).toContain("&lt;名札&amp;&gt;");
    expect(html).toContain("課題「名札」の条件 1 / 5");
    expect(html).toContain("<li>板 ");
  });
});
