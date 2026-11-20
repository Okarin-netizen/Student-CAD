// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// AR(カメラの映像に立体を重ねて見る)で使う立体を作る。2026-11-20 追加。
//
// CAD の立体は「mm・Z が上」、AR は「m(メートル)・Y が上」で考えるので、ここで直す。
// また、立体の底の真ん中を原点にして、机の上にぴったり置けるようにする。

import * as THREE from "three";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import type { BodyMesh } from "../../kernel/rebuild";

/** 立体の色(3D 画面と同じ青) */
export const AR_BODY_COLOR = 0x4f8fe6;

/** 1mm は 0.001m */
const MM_TO_M = 0.001;

/** 実物の大きさ(mm)。案内の文に出す */
export interface ArSize {
  width: number;
  depth: number;
  height: number;
}

/**
 * AR 用の立体を作る。返すのは Group で、その中に立体が1つ入る。
 * - 大きさは実物大(1mm → 0.001m)
 * - 上向きは Y
 * - 底の真ん中が原点(0, 0, 0)
 */
export function buildArObject(mesh: BodyMesh): THREE.Group {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(mesh.vertices.slice(), 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(mesh.normals.slice(), 3));
  geom.setIndex(new THREE.BufferAttribute(mesh.triangles.slice(), 1));

  // Z が上 → Y が上(X 軸のまわりに -90° 回す)。向きは CAD の「前」が手前に来る
  geom.rotateX(-Math.PI / 2);
  geom.scale(MM_TO_M, MM_TO_M, MM_TO_M);

  // 底の真ん中を原点にする
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  geom.translate(-center.x, -box.min.y, -center.z);

  const material = new THREE.MeshStandardMaterial({ color: AR_BODY_COLOR, roughness: 0.55, metalness: 0.05 });
  const body = new THREE.Mesh(geom, material);
  body.name = "作品";

  const group = new THREE.Group();
  group.name = "student-cad";
  group.add(body);
  return group;
}

/** 立体の実物の大きさ(mm)。はば(X)・おく行き(Y)・高さ(Z) */
export function arSize(mesh: BodyMesh): ArSize {
  const box = new THREE.Box3().setFromArray(mesh.vertices);
  const size = box.getSize(new THREE.Vector3());
  return { width: size.x, depth: size.y, height: size.z };
}

/** iPad・iPhone の AR クイックルックで開くファイル(USDZ)を作る */
export async function makeUsdz(object: THREE.Object3D): Promise<Uint8Array> {
  const scene = new THREE.Scene();
  scene.add(object.clone());
  const exporter = new USDZExporter();
  return exporter.parseAsync(scene, {
    // 机や床などの平らな所に置く
    ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "horizontal" } },
    includeAnchoringProperties: true,
    quickLookCompatible: true,
  });
}
