// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { describe, expect, it } from "vitest";
import { authorLabel, fileBaseName, isStudentId } from "../../src/app/author";

const taro = { studentId: "2312", klass: "2-3", number: "12", name: "技術 太郎" };

describe("作った人", () => {
  it("表題欄には 学籍番号と氏名 を書く(入っている所だけ)", () => {
    expect(authorLabel(taro)).toBe("2312 技術 太郎");
    expect(authorLabel({ ...taro, studentId: "" })).toBe("技術 太郎");
    expect(authorLabel(undefined)).toBe("");
  });

  it("ファイル名は 学籍番号_氏名_作品名。空白とファイル名に使えない文字はとる", () => {
    expect(fileBaseName(taro, "マグカップ")).toBe("2312_技術太郎_マグカップ");
    expect(fileBaseName(taro, "A/B", "第三角法")).toBe("2312_技術太郎_AB_第三角法");
    expect(fileBaseName({ ...taro, studentId: "", name: "" }, "")).toBe("作品");
  });

  it("学籍番号は 4 けたの数字", () => {
    expect(isStudentId("2312")).toBe(true);
    expect(isStudentId("231")).toBe(false);
    expect(isStudentId("23a2")).toBe(false);
  });
});
