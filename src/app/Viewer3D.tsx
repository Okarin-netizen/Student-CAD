// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { BodyMesh, SketchDisplay } from "../kernel/rebuild";
import { BASE_PLANE_LABELS, BASE_PLANES } from "../doc/planes";
import type { BasePlaneName, Vec3 } from "../doc/types";

export type PickResult = { kind: "base"; name: BasePlaneName } | { kind: "face"; origin: Vec3; normal: Vec3 };

interface Props {
  mesh: BodyMesh | null;
  sketches: SketchDisplay[];
  /** 平面・面を選ぶ状態か */
  picking: boolean;
  onPick: (p: PickResult) => void;
  onMessage?: (text: string) => void;
  /** 辺をえらぶ状態(角を丸めるとき)。selected はえらんだ辺の真ん中の点 */
  edgePick?: { selected: Vec3[]; onToggle: (mid: Vec3) => void } | null;
  /** 押し出しの作業中など、半透明で見せたいとき */
  ghost?: boolean;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  part: THREE.Group;
  sketchGroup: THREE.Group;
  planes: THREE.Group;
  highlight: THREE.Group;
  edgeMarks: THREE.Group;
  cube: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; mesh: THREE.Mesh };
  render: () => void;
  fitted: boolean;
  mesh: BodyMesh | null;
}

const PLANE_SIZE = 60;
const CUBE_LABELS = ["右", "左", "後", "前", "上", "下"]; // +X -X +Y -Y +Z -Z
const CUBE_DIRS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * 3Dビュー。Onshape のモバイル版と同じく 1本指で回転、2本指で移動・拡大。
 * 右上のビューキューブの面をタップすると、その向きから見られる。
 */
const HOWTO_KEY = "student-cad:howto3d";

export function Viewer3D({ mesh, sketches, picking, onPick, onMessage, edgePick, ghost }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [showHowTo, setShowHowTo] = useState(() => {
    try {
      return localStorage.getItem(HOWTO_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const pickRef = useRef({ picking, onPick, onMessage, edgePick });
  pickRef.current = { picking, onPick, onMessage, edgePick };

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 10000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(80, -120, 200);
    camera.add(sun);
    scene.add(camera);

    const grid = new THREE.GridHelper(400, 40, 0xb5bdc8, 0xdde2e8);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const planes = new THREE.Group();
    for (const name of Object.keys(BASE_PLANES) as BasePlaneName[]) planes.add(makePlane(name));
    scene.add(planes);
    // 原点の3本の軸(X 赤・Y 緑・Z 青)。「ならべる向き」をえらぶときの目印
    scene.add(makeAxes());

    const part = new THREE.Group();
    const sketchGroup = new THREE.Group();
    const highlight = new THREE.Group();
    const edgeMarks = new THREE.Group();
    scene.add(part, sketchGroup, highlight, edgeMarks);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    // ビューキューブ
    const cubeHost = cubeRef.current!;
    const cubeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    cubeRenderer.setSize(96, 96);
    cubeHost.appendChild(cubeRenderer.domElement);
    const cubeScene = new THREE.Scene();
    const cubeCamera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);
    cubeCamera.up.set(0, 0, 1);
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), CUBE_LABELS.map(labelMaterial));
    cubeScene.add(cubeMesh, new THREE.AmbientLight(0xffffff, 3));

    const render = () => {
      renderer.render(scene, camera);
      const dir = camera.position.clone().sub(controls.target).normalize();
      cubeCamera.position.copy(dir.multiplyScalar(4));
      cubeCamera.up.copy(camera.up);
      cubeCamera.lookAt(0, 0, 0);
      cubeRenderer.render(cubeScene, cubeCamera);
    };
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

    const stage: Stage = {
      renderer,
      scene,
      camera,
      controls,
      part,
      sketchGroup,
      planes,
      highlight,
      edgeMarks,
      cube: { renderer: cubeRenderer, scene: cubeScene, camera: cubeCamera, mesh: cubeMesh },
      render,
      fitted: false,
      mesh: null,
    };
    stageRef.current = stage;
    setView(stage, [1, -1.4, 1.1]);
    resize();

    // タップ(動かさずに離した)で平面・面を選ぶ
    let down: { x: number; y: number; t: number } | null = null;
    const hover = (e: PointerEvent) => {
      if (!pickRef.current.picking) return;
      const h = pickAt(stage, e.clientX, e.clientY);
      highlightFace(stage, h.face, h.result?.kind === "face");
    };
    const onDown = (e: PointerEvent) => {
      hideHowTo();
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      hover(e);
    };
    const onMove = (e: PointerEvent) => {
      // マウスのときは、ボタンを押していなくても指している面を見せる
      if (e.pointerType === "mouse" && e.buttons === 0) hover(e);
    };
    const onUp = (e: PointerEvent) => {
      const ep = pickRef.current.edgePick;
      if (down && ep) {
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        down = null;
        if (moved > 8) return;
        const mid = pickEdgeAt(stage, e.clientX, e.clientY);
        if (mid) ep.onToggle(mid);
        else pickRef.current.onMessage?.("辺(線)の近くをタップしてください");
        return;
      }
      if (!down || !pickRef.current.picking) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) {
        if (e.pointerType !== "mouse") highlightFace(stage, null, false);
        return;
      }
      const hit = pickAt(stage, e.clientX, e.clientY);
      if (hit.result) pickRef.current.onPick(hit.result);
      else if (hit.face != null) pickRef.current.onMessage?.("丸い面にはかけません。平らな面をえらんでください");
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    const onCube = (e: PointerEvent) => {
      const rect = cubeRenderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cubeCamera);
      const hit = ray.intersectObject(cubeMesh)[0];
      if (hit?.face) {
        const idx = Math.floor(hit.faceIndex! / 2);
        setView(stage, CUBE_DIRS[idx]);
      }
    };
    cubeRenderer.domElement.addEventListener("pointerup", onCube);

    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      cubeRenderer.dispose();
      host.removeChild(renderer.domElement);
      cubeHost.removeChild(cubeRenderer.domElement);
      stageRef.current = null;
    };
  }, []);

  // 立体
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    clear(stage.part);
    stage.mesh = mesh;
    if (mesh) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
      geom.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const body = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({
          color: 0x4f8fe6,
          roughness: 0.55,
          metalness: 0.05,
          transparent: !!ghost,
          opacity: ghost ? 0.85 : 1,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
      );
      body.name = "body";
      const eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.BufferAttribute(mesh.edges, 3));
      stage.part.add(body, new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1b2a41 })));
      if (!stage.fitted) {
        fitView(stage);
        stage.fitted = true;
      }
    }
    stage.render();
  }, [mesh, ghost]);

  // えらんだ辺を太く見せる
  const selectedKey = JSON.stringify(edgePick?.selected ?? []);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    clear(stage.edgeMarks);
    const sel = edgePick?.selected ?? [];
    if (mesh && sel.length) {
      const pts: number[] = [];
      for (const m of sel) {
        const g = nearestEdgeGroup(mesh, m);
        if (!g) continue;
        for (let i = g.start; i < g.start + g.count; i++) pts.push(...mesh.edges.slice(i * 6, i * 6 + 6));
      }
      if (pts.length) {
        const geom = new LineSegmentsGeometry().setPositions(pts);
        const mat = new LineMaterial({ color: 0xf08c00, linewidth: 6, depthTest: false });
        mat.resolution.set(stage.renderer.domElement.width, stage.renderer.domElement.height);
        const line = new LineSegments2(geom, mat);
        line.renderOrder = 10;
        stage.edgeMarks.add(line);
      }
    }
    stage.render();
  }, [mesh, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // スケッチの線
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    clear(stage.sketchGroup);
    for (const s of sketches) {
      if (s.consumed) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(s.lines, 3));
      stage.sketchGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd9480f })));
    }
    stage.render();
  }, [sketches]);

  // 平面を選ぶときは基準面を目立たせる。立体があるときは、選ぶとき以外は隠す
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const p of stage.planes.children) {
      const m = (p as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = picking ? (mesh ? 0.1 : 0.28) : 0.07;
      p.visible = picking || !mesh;
    }
    if (!picking) clear(stage.highlight);
    stage.render();
  }, [picking, mesh]);

  function hideHowTo() {
    setShowHowTo(false);
    try {
      localStorage.setItem(HOWTO_KEY, "1");
    } catch {
      // 保存できなくてもよい
    }
  }

  return (
    <div className="viewer3d">
      {showHowTo && (
        <div className="howto" role="note" data-testid="howto-3d">
          ☝️ 1本指でまわす ・ ✌️ 2本指で動かす・つまんで大きくする
        </div>
      )}
      <div className="viewer3d-canvas" ref={hostRef} data-testid="viewer-3d" />
      <div className="viewcube" ref={cubeRef} aria-label="ビューキューブ(面をタップするとその向きから見る)" />
      <div className="viewer3d-buttons">
        <button type="button" onClick={() => stageRef.current && setView(stageRef.current, [1, -1.4, 1.1])}>
          ななめ
        </button>
        <button type="button" onClick={() => stageRef.current && fitView(stageRef.current)}>
          全体
        </button>
      </div>
    </div>
  );
}

function makePlane(name: BasePlaneName): THREE.Mesh {
  const p = BASE_PLANES[name];
  const geom = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  geom.translate(PLANE_SIZE / 2, PLANE_SIZE / 2, 0);
  const colors: Record<BasePlaneName, number> = { top: 0x1f6feb, front: 0x2e7d32, right: 0xd9480f };
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({ color: colors[name], transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  const x = new THREE.Vector3(...p.xDir);
  const n = new THREE.Vector3(...p.normal);
  const y = n.clone().cross(x);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(x, y, n);
  mesh.userData.plane = name;
  // 板の角に名前を出す(何の板か分かるように)
  const label = textSprite(BASE_PLANE_LABELS[name], colors[name]);
  label.position.set(PLANE_SIZE - 4, PLANE_SIZE - 4, 0);
  mesh.add(label);
  return mesh;
}

/** 原点から出る3本の軸と、その名前 */
function makeAxes(): THREE.Group {
  const g = new THREE.Group();
  const len = 30;
  const axes: [THREE.Vector3, number, string][] = [
    [new THREE.Vector3(1, 0, 0), 0xd62828, "X"],
    [new THREE.Vector3(0, 1, 0), 0x2b9348, "Y"],
    [new THREE.Vector3(0, 0, 1), 0x1f6feb, "Z"],
  ];
  for (const [dir, color, name] of axes) {
    const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(len)]);
    g.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color, depthTest: false })));
    const label = textSprite(name, color);
    label.position.copy(dir.clone().multiplyScalar(len + 4));
    g.add(label);
  }
  g.renderOrder = 2;
  return g;
}

function textSprite(text: string, color: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 40px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#" + color.toString(16).padStart(6, "0");
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(16, 4, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function labelMaterial(text: string): THREE.MeshBasicMaterial {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3f6fa";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#9aa4b2";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  g.fillStyle = "#1b2430";
  g.font = "bold 64px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex });
}

function clear(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
}

interface PickHit {
  result: PickResult | null;
  /** 立体の面の番号(平らでない面も含む) */
  face: number | null;
}

/**
 * 指の下にある面・平面を探す。立体の面を基準面より先にする
 * (基準面は半透明で立体の手前に重なることがあるため)。
 */
function pickAt(stage: Stage, clientX: number, clientY: number): PickHit {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, stage.camera);
  const body = stage.part.children.find((c) => c.name === "body");
  const mesh = stage.mesh;
  const hit = body ? ray.intersectObject(body, false)[0] : undefined;
  if (hit && mesh && hit.faceIndex != null) {
    const tri = hit.faceIndex * 3;
    const group = mesh.faceGroups.find((g) => tri >= g.start && tri < g.start + g.count);
    if (!group) return { result: null, face: null };
    const face = mesh.faces[group.face];
    return { result: face.planar ? { kind: "face", origin: face.origin, normal: face.normal } : null, face: group.face };
  }
  for (const p of stage.planes.children) p.updateMatrixWorld(true);
  const planeHit = ray.intersectObjects(stage.planes.children.filter((p) => p.visible), false)[0];
  if (planeHit) return { result: { kind: "base", name: planeHit.object.userData.plane as BasePlaneName }, face: null };
  return { result: null, face: null };
}

/** タップした場所に一番近い、見えている辺の真ん中の点 */
function pickEdgeAt(stage: Stage, clientX: number, clientY: number): Vec3 | null {
  const mesh = stage.mesh;
  if (!mesh) return null;
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const tap = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(stage.camera);
    return new THREE.Vector2(((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height);
  };
  // 指の下の立体までの距離。それより奥の辺(裏側の辺)はえらばない
  const ndc = new THREE.Vector2((tap.x / rect.width) * 2 - 1, -(tap.y / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, stage.camera);
  const body = stage.part.children.find((c) => c.name === "body");
  const hit = body ? ray.intersectObject(body, false)[0] : undefined;
  const limit = hit ? hit.distance + Math.max(1, hit.distance * 0.02) : Infinity;
  let best: { mid: Vec3; d: number } | null = null;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const g of mesh.edgeGroups) {
    for (let i = g.start; i < g.start + g.count; i++) {
      a.fromArray(mesh.edges, i * 6);
      b.fromArray(mesh.edges, i * 6 + 3);
      const sa = toScreen(a);
      const sb = toScreen(b);
      const ab = sb.clone().sub(sa);
      const t = Math.max(0, Math.min(1, tap.clone().sub(sa).dot(ab) / (ab.lengthSq() || 1)));
      const d = sa.clone().addScaledVector(ab, t).distanceTo(tap);
      if (d > 18 || (best && d >= best.d)) continue;
      const p3 = a.clone().lerp(b, t);
      if (p3.distanceTo(stage.camera.position) > limit) continue;
      best = { mid: g.mid, d };
    }
  }
  return best?.mid ?? null;
}

function nearestEdgeGroup(mesh: BodyMesh, mid: Vec3) {
  let best: { g: BodyMesh["edgeGroups"][number]; d: number } | null = null;
  for (const g of mesh.edgeGroups) {
    const d = Math.hypot(g.mid[0] - mid[0], g.mid[1] - mid[1], g.mid[2] - mid[2]);
    if (d < 1.5 && (!best || d < best.d)) best = { g, d };
  }
  return best?.g ?? null;
}

/** 選べそうな面を明るく塗る */
function highlightFace(stage: Stage, face: number | null, ok: boolean) {
  clear(stage.highlight);
  const mesh = stage.mesh;
  if (face != null && mesh) {
    const g = mesh.faceGroups.find((x) => x.face === face);
    if (g) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geom.setIndex(new THREE.BufferAttribute(mesh.triangles.slice(g.start, g.start + g.count), 1));
      const m = new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({ color: ok ? 0xf08c00 : 0x9aa4b2, transparent: true, opacity: 0.6, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      stage.highlight.add(m);
    }
  }
  stage.render();
}

function setView(stage: Stage, dir: Vec3) {
  const box = new THREE.Box3().setFromObject(stage.part);
  if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(PLANE_SIZE, PLANE_SIZE, PLANE_SIZE / 3));
  const center = box.getCenter(new THREE.Vector3());
  const size = Math.max(box.getSize(new THREE.Vector3()).length(), 20);
  const d = new THREE.Vector3(...dir).normalize();
  // 真上・真下から見るときは、少しだけ手前(-Y)に寄せて画面の上を +Y にする(回転の軸が乱れないように)
  if (Math.abs(d.z) > 0.999) d.set(0, -0.002, Math.sign(d.z)).normalize();
  stage.camera.position.copy(center).addScaledVector(d, size * 1.6);
  stage.controls.target.copy(center);
  stage.controls.update();
  stage.render();
}

function fitView(stage: Stage) {
  const dir = stage.camera.position.clone().sub(stage.controls.target).normalize();
  setView(stage, [dir.x, dir.y, dir.z]);
}
