// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 操作して見つけたバグの再発を防ぐテスト(2026-11-06)

import { describe, expect, it } from "vitest";
import { isDoc } from "../../src/app/persist";
import { cancelMode, getState, replaceDoc, setState, startExtrude, startReplay, undo, redo, commitDoc } from "../../src/app/store";
import { emptyDocument, type SketchFeature } from "../../src/doc/types";
import { dosDateTime, makeZip } from "../../src/export/zip";

const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "スケッチ1", plane: { kind: "base", name: "top" }, entities: [], constraints: [] };

describe("こわれた作品ファイル", () => {
  it("作業に必要な一覧がないファイルは開かない(開くと画面が止まっていた)", () => {
    expect(isDoc({ format: "student-cad", features: [{ id: "a", type: "sketch", name: "x" }] })).toBe(false);
    expect(isDoc({ format: "student-cad", features: [{ id: "f", type: "fillet", radius: 2 }] })).toBe(false);
    expect(isDoc({ format: "student-cad", features: [null] })).toBe(false);
    expect(isDoc({ format: "student-cad", features: [], variables: "x" })).toBe(false);
    expect(isDoc({ ...emptyDocument(), features: [sketch] })).toBe(true);
  });

  it("名前のない作品には名前をつける", () => {
    replaceDoc({ format: "student-cad", version: 1, features: [] } as unknown as ReturnType<typeof emptyDocument>);
    expect(getState().doc.name).toBe("新しい作品");
  });
});

describe("もどす(Ctrl+Z)", () => {
  it("押し出しの設定中は、設計図をもどさない(作業が消えていた)", () => {
    replaceDoc({ ...emptyDocument(), features: [sketch] });
    commitDoc({ ...getState().doc, name: "名前を変えた" });
    startExtrude();
    expect(getState().mode.kind).toBe("op");
    undo();
    expect(getState().doc.name).toBe("名前を変えた");
    cancelMode();
  });

  it("作り方の再生中は、もどす・やりなおすをしない(作品が空になっていた)", () => {
    replaceDoc({ ...emptyDocument(), features: [sketch] });
    commitDoc({ ...getState().doc, name: "a" });
    startReplay();
    expect(getState().mode.kind).toBe("replay");
    undo();
    redo();
    expect(getState().doc.name).toBe("a");
    expect(getState().doc.features).toHaveLength(1);
    setState({ mode: { kind: "model" } });
    undo();
    expect(getState().doc.name).toBe("新しい作品");
  });
});

describe("ZIP の日付", () => {
  it("作った日時を入れる(0 のままだと 1980年0月0日 になっていた)", () => {
    const { date, time } = dosDateTime(new Date(2026, 10, 6, 13, 45, 30));
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(11);
    expect(date & 0x1f).toBe(6);
    expect(time >> 11).toBe(13);
    expect((time >> 5) & 0x3f).toBe(45);
    expect((time & 0x1f) * 2).toBe(30);
    const zip = makeZip([{ name: "a.txt", data: new Uint8Array([1]) }], new Date(2026, 10, 6));
    const v = new DataView(zip.buffer);
    expect(v.getUint16(12, true)).toBe(dosDateTime(new Date(2026, 10, 6)).date);
  });
});
