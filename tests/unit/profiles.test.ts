import { describe, expect, it } from "vitest";
import { findProfiles } from "../../src/sketch/profiles";
import { rectSketch } from "./fixtures";

const settled = (w: number, h: number, d = 0) => {
  const s = rectSketch(w, h, d);
  const pos: Record<string, [number, number]> = { a: [0, 0], b: [w, 0], c: [w, h], d: [0, h], cc: [w / 2, h / 2] };
  s.entities = s.entities.map((e) => (e.type === "point" ? { ...e, x: pos[e.id][0], y: pos[e.id][1] } : e.type === "circle" ? { ...e, r: d / 2 } : e));
  return s;
};

describe("findProfiles", () => {
  it("長方形は面1枚", () => {
    const r = findProfiles(settled(40, 20));
    expect(r.regions).toHaveLength(1);
    expect(r.regions[0].outer.area).toBeCloseTo(800, 6);
    expect(r.openChains).toBe(0);
  });

  it("長方形の中の円は穴になる", () => {
    const r = findProfiles(settled(40, 20, 6));
    expect(r.regions).toHaveLength(1);
    expect(r.regions[0].holes).toHaveLength(1);
  });

  it("閉じていない線は数えるだけで使わない", () => {
    const s = settled(40, 20);
    s.entities = s.entities.filter((e) => e.id !== "l4");
    const r = findProfiles(s);
    expect(r.regions).toHaveLength(0);
    expect(r.openChains).toBe(1);
  });

  it("補助線は輪郭に使わない", () => {
    const s = settled(40, 20);
    s.entities = s.entities.map((e) => (e.id === "l2" ? { ...e, construction: true } : e));
    expect(findProfiles(s).regions).toHaveLength(0);
  });
});
