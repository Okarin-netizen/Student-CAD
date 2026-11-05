// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshData } from "./buildPlate";

type ViewName = "iso" | "top" | "front";

interface Props {
  mesh: MeshData | null;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  part: THREE.Group;
  render: () => void;
  fitted: boolean;
}

/**
 * 3Dビュー。操作は Onshape のモバイル版と同じにする:
 * 1本指ドラッグ = 回転、2本指 = 移動と拡大縮小(ピンチ)。
 * 画面が変わったときだけ描画して、タブレットの電池を節約する。
 */
export function Viewer3D({ mesh }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.up.set(0, 0, 1); // CAD と同じく Z を上にする

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(80, -120, 200);
    scene.add(sun);

    const grid = new THREE.GridHelper(200, 20, 0x9aa4b2, 0xd0d6de);
    grid.rotation.x = Math.PI / 2; // XY 平面に寝かせる
    scene.add(grid);

    const part = new THREE.Group();
    scene.add(part);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    stageRef.current = { renderer, scene, camera, controls, part, render, fitted: false };
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !mesh) return;
    for (const child of [...stage.part.children]) {
      stage.part.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geom.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
    const body = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: 0x4f8fe6, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    );
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute("position", new THREE.BufferAttribute(mesh.edges, 3));
    const edges = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ color: 0x1b2a41 }));
    stage.part.add(body, edges);
    if (!stage.fitted) {
      setView(stage, "iso");
      stage.fitted = true;
    }
    stage.render();
  }, [mesh]);

  return (
    <div className="viewer">
      <div className="viewer-canvas" ref={hostRef} data-testid="viewer-3d" />
      <div className="viewer-buttons" role="group" aria-label="視点">
        <button type="button" onClick={() => stageRef.current && setView(stageRef.current, "iso")}>ななめ</button>
        <button type="button" onClick={() => stageRef.current && setView(stageRef.current, "top")}>上から</button>
        <button type="button" onClick={() => stageRef.current && setView(stageRef.current, "front")}>正面</button>
      </div>
      <p className="viewer-hint">1本指で回す・2本指で動かす/拡大</p>
    </div>
  );
}

function setView(stage: Stage, view: ViewName) {
  const box = new THREE.Box3().setFromObject(stage.part);
  if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(50, 30, 5));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = Math.max(size, 10) * 1.6;
  const dir =
    view === "top" ? new THREE.Vector3(0, -0.0001, 1) : view === "front" ? new THREE.Vector3(0, -1, 0.0001) : new THREE.Vector3(0.9, -1.3, 1.1);
  stage.camera.position.copy(center).addScaledVector(dir.normalize(), dist);
  stage.controls.target.copy(center);
  stage.controls.update();
  stage.render();
}
