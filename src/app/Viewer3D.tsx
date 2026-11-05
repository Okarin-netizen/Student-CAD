import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BodyMesh, SketchDisplay } from "../kernel/rebuild";
import { BASE_PLANES } from "../doc/planes";
import type { BasePlaneName, Vec3 } from "../doc/types";

export type PickResult = { kind: "base"; name: BasePlaneName } | { kind: "face"; origin: Vec3; normal: Vec3 };

interface Props {
  mesh: BodyMesh | null;
  sketches: SketchDisplay[];
  /** 平面・面を選ぶ状態か */
  picking: boolean;
  onPick: (p: PickResult) => void;
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
export function Viewer3D({ mesh, sketches, picking, onPick, ghost }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const pickRef = useRef({ picking, onPick });
  pickRef.current = { picking, onPick };

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

    const part = new THREE.Group();
    const sketchGroup = new THREE.Group();
    scene.add(part, sketchGroup);

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
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || !pickRef.current.picking) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) return;
      const hit = pickAt(stage, e.clientX, e.clientY);
      if (hit) pickRef.current.onPick(hit);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
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
      m.opacity = picking ? 0.28 : 0.07;
      p.visible = picking || !mesh;
    }
    stage.render();
  }, [picking, mesh]);

  return (
    <div className="viewer3d">
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
  return mesh;
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

function pickAt(stage: Stage, clientX: number, clientY: number): PickResult | null {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, stage.camera);
  const targets = [...stage.part.children.filter((c) => c.name === "body"), ...stage.planes.children];
  for (const p of stage.planes.children) p.updateMatrixWorld(true);
  const hits = ray.intersectObjects(targets, false);
  for (const hit of hits) {
    if (hit.object.userData.plane) return { kind: "base", name: hit.object.userData.plane as BasePlaneName };
    const mesh = stage.mesh;
    if (!mesh || hit.faceIndex == null) continue;
    const tri = hit.faceIndex * 3;
    const group = mesh.faceGroups.find((g) => tri >= g.start && tri < g.start + g.count);
    const face = group ? mesh.faces[group.face] : null;
    if (face?.planar) return { kind: "face", origin: face.origin, normal: face.normal };
    return null; // 曲面は選べない
  }
  return null;
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
