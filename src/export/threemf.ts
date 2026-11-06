// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 3MF(3Dプリンター用の新しい形式。単位や名前も入る)を作る。
// 3MF は決まった名前の XML ファイルを ZIP にまとめたもの。

import { makeZip } from "./zip";
import { escapeXml } from "../util/xml";

export interface TriangleMesh {
  /** xyz の並び */
  vertices: ArrayLike<number>;
  /** 3つずつで1つの三角形 */
  triangles: ArrayLike<number>;
}

/**
 * 面ごとに分かれている点を、同じ位置ならまとめる(3Dプリンターのソフトが「穴あき」と言わないように)。
 * つぶれた三角形はすてる。
 */
export function weldMesh(mesh: TriangleMesh, precision = 1e-4): { vertices: number[]; triangles: number[] } {
  const key = (i: number) => [0, 1, 2].map((k) => Math.round(mesh.vertices[i * 3 + k] / precision)).join(",");
  const index = new Map<string, number>();
  const remap: number[] = [];
  const vertices: number[] = [];
  for (let i = 0; i < mesh.vertices.length / 3; i++) {
    const k = key(i);
    let j = index.get(k);
    if (j === undefined) {
      j = vertices.length / 3;
      index.set(k, j);
      vertices.push(mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]);
    }
    remap.push(j);
  }
  const triangles: number[] = [];
  for (let t = 0; t + 2 < mesh.triangles.length; t += 3) {
    const [a, b, c] = [remap[mesh.triangles[t]], remap[mesh.triangles[t + 1]], remap[mesh.triangles[t + 2]]];
    if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
  }
  return { vertices, triangles };
}

const num = (v: number) => String(Math.round(v * 1e5) / 1e5);

export function make3MF(mesh: TriangleMesh, title: string): Uint8Array {
  const m = weldMesh(mesh);
  const verts: string[] = [];
  for (let i = 0; i < m.vertices.length; i += 3) verts.push(`<vertex x="${num(m.vertices[i])}" y="${num(m.vertices[i + 1])}" z="${num(m.vertices[i + 2])}"/>`);
  const tris: string[] = [];
  for (let i = 0; i < m.triangles.length; i += 3) tris.push(`<triangle v1="${m.triangles[i]}" v2="${m.triangles[i + 1]}" v3="${m.triangles[i + 2]}"/>`);
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="ja-JP" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${escapeXml(title)}</metadata>`,
    '<metadata name="Application">Student-CAD</metadata>',
    `<resources><object id="1" type="model" name="${escapeXml(title)}"><mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh></object></resources>`,
    '<build><item objectid="1"/></build>',
    "</model>",
  ].join("\n");
  const types =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  const enc = new TextEncoder();
  return makeZip([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "3D/3dmodel.model", data: enc.encode(model) },
  ]);
}
