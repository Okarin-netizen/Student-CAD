// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// ファイル名の決まり(2026-11-25 全体の点検で1つにまとめた)
import { describe, expect, it } from "vitest";
import { docFileName, safeFileName } from "../../src/util/fileName";
import { fileBaseName } from "../../src/app/author";
import { submissionName } from "../../src/export/submission";
import { screenWords } from "../../src/app/terms";

describe("ファイル名", () => {
  it("空白はとり、使えない文字は「_」にする", () => {
    expect(safeFileName("技術 太郎")).toBe("技術太郎");
    expect(safeFileName("A/B")).toBe("A_B");
    expect(safeFileName('  a:b*?"<>|  ')).toBe("a_b");
    expect(safeFileName("///")).toBe("");
  });

  it("作品の名前から STL などのファイル名を作る。名前が空なら「作品」", () => {
    expect(docFileName("ペン立て 1/2", "stl")).toBe("ペン立て1_2.stl");
    expect(docFileName("", "scad.json")).toBe("作品.scad.json");
    expect(docFileName("???", "3mf")).toBe("作品.3mf");
  });

  it("図面と提出 ZIP で、同じ作品名は同じ書き方になる", () => {
    const taro = { studentId: "2312", klass: "", number: "", name: "技術 太郎" };
    expect(fileBaseName(taro, "A/B")).toBe("2312_技術太郎_A_B");
    expect(submissionName({ studentId: "2312", name: "技術 太郎" }, "A/B")).toBe("2312_技術太郎_A_B.zip");
  });
});

describe("画面の言葉", () => {
  it("ふだんの言葉では「スケッチ」を「絵」に、マウスでは「タップ」を「クリック」にする", () => {
    expect(screenWords("スケッチをかき終えて", false)).toContain("絵をかき終えて");
    expect(screenWords("スケッチをかき終えて", true)).toContain("スケッチ");
  });
});
