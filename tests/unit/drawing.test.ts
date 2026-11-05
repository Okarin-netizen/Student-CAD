// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { beforeAll, describe, expect, it } from "vitest";
import opencascade from "replicad-opencascadejs";
import { makeBox, makeCylinder, setOC } from "replicad";
import { projectViews } from "../../src/kernel/projection";
import { buildSheet, featureLevels, laserDXF, sheetToDXF, sheetToSVG, viewBounds } from "../../src/drawing/sheet";
import { make3MF, weldMesh } from "../../src/export/threemf";
import { crc32 } from "../../src/export/zip";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import { rebuild } from "../../src/kernel/rebuild";
import { docWith, rectSketch } from "./fixtures";

let gcs: GcsWrapper;
beforeAll(async () => {
  setOC(await opencascade());
  gcs = await make_gcs_wrapper();
});

const box = () => makeBox([0, 0, 0], [40, 20, 10]);
const dims = (b: ReturnType<typeof viewBounds>) => [b!.max[0] - b!.min[0], b!.max[1] - b!.min[1]].map((v) => Math.round(v * 100) / 100);

describe("図をかく(投影)", () => {
  it("第三角法: 正面図は はば×高さ、平面図は はば×奥行き、右側面図は 奥行き×高さ", () => {
    const [front, top, right] = projectViews(box(), "thirdAngle", true);
    expect(front.name).toBe("front");
    expect(dims(viewBounds(front))).toEqual([40, 10]);
    expect(dims(viewBounds(top))).toEqual([40, 20]);
    expect(dims(viewBounds(right))).toEqual([20, 10]);
  });

  it("見える線と重なるかくれ線はかかない(穴のない箱にはかくれ線がない)", () => {
    for (const v of projectViews(box(), "thirdAngle", true)) expect(v.hidden).toHaveLength(0);
  });

  it("穴は正面図でかくれ線になる", () => {
    const holed = box().cut(makeCylinder(4, 10, [20, 10, 0], [0, 0, 1]));
    const [front, top] = projectViews(holed, "thirdAngle", true);
    expect(front.hidden.length).toBeGreaterThanOrEqual(2);
    // 平面図では穴は円(見える線)
    expect(top.visible.some((l) => l.length > 8)).toBe(true);
    expect(projectViews(holed, "thirdAngle", false)[0].hidden).toHaveLength(0);
  });

  it("同じ中心の円(コップの外と内)は、直径の文字を別の向きに書いて重ねない", () => {
    const cup = makeCylinder(40, 95, [0, 0, 0], [0, 0, 1]).cut(makeCylinder(35, 90, [0, 0, 5], [0, 0, 1]));
    const sheet = buildSheet(projectViews(cup, "thirdAngle", false), { kind: "thirdAngle", title: "", author: "", dimensions: true });
    const labels = sheet.texts.filter((t) => t.text.startsWith("⌀"));
    expect(labels.map((t) => t.text).sort()).toEqual(["⌀70", "⌀80"]);
    const [a, b] = labels;
    expect(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1])).toBeGreaterThan(20);
  });

  it("細かい寸法: 段の位置・穴の中心・角の丸み R を入れ、全体の寸法も書く", () => {
    // 40×20×10 の板に、高さ 6 までの段(右 15mm を けずる)と、⌀8 の穴(中心 x=12, y=10)
    const step = box().cut(makeBox([25, 0, 6], [40, 20, 10])).cut(makeCylinder(4, 10, [12, 10, 0], [0, 0, 1]));
    const views = projectViews(step, "thirdAngle", true);
    const levels = featureLevels(views, views.slice(0, 3).map((v) => viewBounds(v)!));
    // はば: 左はし・穴の中心・段・右はし(穴のふち 8 と 16 は直径で分かるので入れない)
    expect(levels[0]).toEqual([0, 12, 25, 40]);
    // 奥行き: 手前・穴の中心・奥
    expect(levels[1]).toEqual([0, 10, 20]);
    // 高さ: 底・段・上
    expect(levels[2]).toEqual([0, 6, 10]);
    const sheet = buildSheet(views, { kind: "thirdAngle", title: "", author: "", dimensions: true });
    const t = sheet.texts.map((x) => x.text);
    for (const v of ["12", "13", "15", "40", "6", "4", "10", "20", "⌀8"]) expect(t).toContain(v);

    const rounded = box().fillet(3, (e) => e.inDirection("Z"));
    const rv = projectViews(rounded, "thirdAngle", false);
    const rt = buildSheet(rv, { kind: "thirdAngle", title: "", author: "", dimensions: true }).texts.map((x) => x.text);
    // 同じ R は図面に1回だけ書く
    expect(rt.filter((x) => x === "R3")).toHaveLength(1);
  });

  it("穴には中心線を入れ、平面図に直径を書く", () => {
    const holed = box().cut(makeCylinder(4, 10, [20, 10, 0], [0, 0, 1]));
    const views = projectViews(holed, "thirdAngle", false);
    expect(views[1].circles).toEqual([{ c: [20, 10], r: 4 }]);
    const sheet = buildSheet(views, { kind: "thirdAngle", title: "", author: "", dimensions: true });
    // 穴の中心線 2 本 + 表題欄の第三角法の記号の中心線 3 本
    expect(sheet.lines.filter((l) => l.style === "center")).toHaveLength(5);
    expect(sheet.texts.map((t) => t.text)).toContain("⌀8");
  });

  it("スケッチでかいた穴(半円2つの辺になる)にも中心線と直径が入る", () => {
    const ex = { id: "ex1", type: "extrude" as const, name: "押し出し1", sketchId: "sk1", distance: 10, operation: "add" as const, flip: false };
    const out = rebuild(docWith(rectSketch(40, 20, 8), ex), gcs);
    const views = projectViews(out.body!, "thirdAngle", true);
    // フィクスチャの穴は「角からの距離」で決めているので、位置はだいたい真ん中
    expect(views[1].circles).toHaveLength(1);
    expect(views[1].circles[0].r).toBeCloseTo(4, 3);
    const sheet = buildSheet(views, { kind: "thirdAngle", title: "", author: "", dimensions: true });
    expect(sheet.texts.map((t) => t.text)).toContain("⌀8");
  });

  it("等角図は軸の方向が実際の長さ(立方体の幅は 2×10×cos30°、高さは 20)", () => {
    const [iso] = projectViews(makeBox([0, 0, 0], [10, 10, 10]), "isometric", false);
    const [w, h] = dims(viewBounds(iso));
    expect(w).toBeCloseTo(2 * 10 * Math.cos(Math.PI / 6), 1);
    expect(h).toBeCloseTo(20, 1);
  });

  it("キャビネット図は奥行きを 45° に半分の長さでかく", () => {
    const [cab] = projectViews(box(), "cabinet", false);
    const k = 0.5 * Math.SQRT1_2;
    const [w, h] = dims(viewBounds(cab));
    expect(w).toBeCloseTo(40 + 20 * k, 1);
    expect(h).toBeCloseTo(10 + 20 * k, 1);
  });
});

describe("図面(用紙)と書き出し", () => {
  it("用紙に入る尺度をえらび、寸法・表題欄を入れる", () => {
    const views = projectViews(box(), "thirdAngle", true);
    const sheet = buildSheet(views, { kind: "thirdAngle", title: "ペン立て", author: "技術 太郎", dimensions: true });
    expect(sheet.scaleLabel).toBe("2:1");
    const texts = sheet.texts.map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(["正面図", "平面図", "右側面図", "40", "10", "20", "ペン立て", "技術 太郎"]));
    // 大きな形は縮める
    const big = buildSheet(projectViews(makeBox([0, 0, 0], [400, 200, 100]), "thirdAngle", false), { kind: "thirdAngle", title: "", author: "", dimensions: true });
    expect(big.scaleLabel).toBe("1:5");
  });

  it("SVG と DXF にできる(日本語は DXF の決まりで書く)", () => {
    const holed = box().cut(makeCylinder(4, 10, [20, 10, 0], [0, 0, 1]));
    const sheet = buildSheet(projectViews(holed, "thirdAngle", true), { kind: "thirdAngle", title: "名札", author: "", dimensions: true });
    const svg = sheetToSVG(sheet);
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("名札");
    const dxf = sheetToDXF(sheet);
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("HIDDEN");
    expect(dxf).toContain("\\U+540D"); // 名
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });

  it("レーザー加工用 DXF は、上から見た形を左下 (0,0) から 1:1 でかく", () => {
    const [, top] = projectViews(makeBox([5, 5, 0], [45, 25, 3]), "thirdAngle", false);
    const dxf = laserDXF(top);
    const xs = [...dxf.matchAll(/\r\n1[01]\r\n([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(40);
    expect(dxf).not.toContain("TEXT");
  });
});

describe("3MF", () => {
  it("同じ位置の点をまとめて、どの辺も2つの三角形で共有される(穴のない形)", () => {
    const m = box().mesh({ tolerance: 0.05, angularTolerance: 12 });
    const w = weldMesh(m);
    expect(w.vertices.length / 3).toBe(8);
    const edges = new Map<string, number>();
    for (let i = 0; i < w.triangles.length; i += 3) {
      const t = [w.triangles[i], w.triangles[i + 1], w.triangles[i + 2]];
      for (let k = 0; k < 3; k++) {
        const key = [t[k], t[(k + 1) % 3]].sort().join("-");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
  });

  it("ZIP の形で、3D モデルの XML が入っている", () => {
    const m = box().mesh({ tolerance: 0.05, angularTolerance: 12 });
    const bytes = make3MF(m, "テスト&作品");
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("3D/3dmodel.model");
    expect(text).toContain('unit="millimeter"');
    expect(text).toContain("テスト&amp;作品");
  });

  it("CRC32 は決まった値になる", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
