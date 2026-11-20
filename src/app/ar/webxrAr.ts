// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// Android の Chrome などで、WebXR を使って立体を机の上に置いて見る。2026-11-20 追加。
//
// 流れ
//   1. カメラが開く。平らな所(机・床)が見つかると、そこに みどりの輪 が出る
//   2. 画面をタップすると、輪の所に立体を置く(もう一度タップすると置き直す)
//   3. 「まわす」で 45° ずつ回す。「おわる」かスマホの「もどる」で終わる
//
// 画面の文字やボタン(overlayRoot)は、WebXR の「DOM オーバーレイ」でカメラの映像の上に出す。

import * as THREE from "three";

/** AR 画面のようす。案内の文を変えるのに使う */
export type XrPhase = "searching" | "found" | "placed";

export interface XrArOptions {
  /** 置く立体(arModel.ts の buildArObject で作ったもの) */
  object: THREE.Object3D;
  /** カメラの映像の上に出す文字・ボタンの入れ物 */
  overlayRoot: HTMLElement;
  onPhase: (phase: XrPhase) => void;
  /** AR が終わったとき(「おわる」・もどる・エラー) */
  onEnd: () => void;
}

export interface XrArControl {
  /** 立体を 45° 回す */
  rotate: () => void;
  /** AR を終わる */
  end: () => void;
}

const ROTATE_STEP = Math.PI / 4;

/**
 * WebXR の AR を始める。ボタンを押したそのときに呼ぶこと(ブラウザの決まり)。
 * 始められなかったときは、エラーを投げる。
 */
export async function startWebXrAr({ object, overlayRoot, onPhase, onEnd }: XrArOptions): Promise<XrArControl> {
  const xr = navigator.xr;
  if (!xr) throw new Error("WebXR がありません");
  const session = await xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: overlayRoot },
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);

  const { scene, reticle, holder } = buildScene(object);
  const localSpace = await session.requestReferenceSpace("local");
  const viewerSpace = await session.requestReferenceSpace("viewer");
  const hitSource = await session.requestHitTestSource?.({ space: viewerSpace });

  let phase: XrPhase | null = null;
  const setPhase = (p: XrPhase) => {
    if (p !== phase) onPhase((phase = p));
  };
  setPhase("searching");

  // ---- 毎フレーム: 平らな所をさがして、輪を出す ----
  renderer.setAnimationLoop((_time, frame) => {
    const hit = frame && hitSource ? frame.getHitTestResults(hitSource)[0] : undefined;
    const pose = hit?.getPose(localSpace);
    reticle.visible = !!pose;
    if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    if (!holder.visible) setPhase(pose ? "found" : "searching");
    renderer.render(scene, renderer.xr.getCamera());
  });

  // ---- 画面をタップ: 輪の所に置く ----
  const onSelect = () => {
    if (!reticle.visible) return;
    reticle.matrix.decompose(holder.position, new THREE.Quaternion(), new THREE.Vector3());
    holder.visible = true;
    setPhase("placed");
  };
  session.addEventListener("select", onSelect);

  // ボタンを押したときは、立体を置き直さない
  const ignoreSelect = (e: Event) => e.preventDefault();
  overlayRoot.addEventListener("beforexrselect", ignoreSelect);

  // ---- 終わり: あとかたづけ ----
  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    hitSource?.cancel();
    overlayRoot.removeEventListener("beforexrselect", ignoreSelect);
    renderer.dispose();
    onEnd();
  });

  return {
    rotate: () => {
      holder.rotation.y += ROTATE_STEP;
    },
    end: () => {
      void session.end().catch(() => undefined);
    },
  };
}

/** AR の場面(明かり・平らな所の輪・立体と、その下のかげ)を作る */
function buildScene(object: THREE.Object3D) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.3, 1, 0.5);
  scene.add(sun);

  // 平らな所の目じるし(三角定規のみどりの輪)
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.04, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0f7356 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // 立体は holder に入れて、holder を動かす・回す
  const holder = new THREE.Group();
  holder.visible = false;
  holder.add(object, makeShadow(object));
  scene.add(holder);

  return { scene, reticle, holder };
}

/** 立体の下に うすいかげを置く(机に置いているように見せる) */
function makeShadow(object: THREE.Object3D): THREE.Mesh {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.6 || 0.05;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  shadow.position.y = 0.0005;
  return shadow;
}
