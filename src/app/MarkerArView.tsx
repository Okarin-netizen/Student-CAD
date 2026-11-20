// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// マーカーAR の画面。2026-11-20 追加。
// Chromebook・パソコンのように WebXR の AR が使えない端末で、印刷したマーカーをカメラにうつし、
// その上に作った立体を実物大で乗せて見せる。前のカメラ(自分がうつるカメラ)しかない端末でも使えるように、
// 前のカメラのときは鏡のように左右を反対にして見せる(紙を動かした向きと、画面の動きが同じになる)。

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MarkerTracker } from "./ar/markerTracker";
import { Icon } from "./Icon";

interface Props {
  /** 乗せる立体(arModel.ts の buildArObject で作ったもの。単位 m・Y が上) */
  object: THREE.Object3D;
  onClose: () => void;
}

/** マーカーをさがす絵の はば(px)。大きいほど遠くのマーカーも見つかるが、計算が重くなる */
const DETECT_WIDTH = 640;
/** マーカーが この回数 続けて見つからなかったら、立体をかくす */
const LOST_FRAMES = 8;
/** 立体のゆれをおさえる強さ(0〜1。小さいほど なめらかだが おくれる) */
const SMOOTH = 0.5;
const ROTATE_STEP = Math.PI / 4;

type Status = "starting" | "searching" | "found" | "error";

export function MarkerArView({ object, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState("");
  const [mirrored, setMirrored] = useState(true);
  const [aspect, setAspect] = useState(4 / 3);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current!;
    const stage = stageRef.current!;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let renderer: THREE.WebGLRenderer | null = null;

    const start = async () => {
      try {
        stream = await openCamera(cameraIndex === null ? null : cameras[cameraIndex]?.deviceId ?? null);
      } catch (e) {
        if (stopped) return;
        setError(cameraErrorText(e));
        setStatus("error");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
      // 後ろのカメラだと分かるときだけ、鏡にしない(パソコンのカメラは向きが分からないことが多く、たいてい前)
      setMirrored(settings.facingMode !== "environment");
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      await waitForSize(video);
      if (stopped) return;
      setAspect(video.videoWidth / video.videoHeight);
      if (cameraIndex === null) {
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        if (!stopped) setCameras(list);
      }
      renderer = runTracking(video, stage, object, rotationRef, setStatus, () => stopped, (id) => (frame = id));
    };
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [cameraIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // パソコンでは Esc でも終われるようにする
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const switchCamera = () => {
    setStatus("starting");
    setCameraIndex((i) => ((i ?? currentIndex(cameras, videoRef.current)) + 1) % cameras.length);
  };

  return (
    <div className="marker-ar" role="dialog" aria-label="マーカーで見る" data-testid="marker-ar">
      <div
        ref={stageRef}
        className={mirrored ? "marker-stage mirrored" : "marker-stage"}
        style={{ "--ar": aspect } as React.CSSProperties}
      >
        <video ref={videoRef} playsInline muted />
      </div>
      <p className="ar-hint marker-hint" role="status" data-testid="marker-status">
        {statusText(status, error, mirrored)}
      </p>
      <div className="ar-buttons marker-buttons">
        <button type="button" onClick={() => (rotationRef.current += ROTATE_STEP)} disabled={status !== "found"}>
          <Icon name="revolve" /> まわす
        </button>
        {cameras.length > 1 && (
          <button type="button" onClick={switchCamera} data-testid="marker-switch">
            カメラを切りかえ
          </button>
        )}
        <button type="button" className="primary" onClick={onClose} data-testid="marker-close">
          おわる
        </button>
      </div>
    </div>
  );
}

/** カメラを開く。後ろのカメラがあれば そちらを使う */
function openCamera(deviceId: string | null): Promise<MediaStream> {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: "environment" }, ...size };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/** 映像の大きさが分かるまで待つ */
function waitForSize(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((ok) => video.addEventListener("loadedmetadata", () => ok(), { once: true }));
}

/** いま使っているカメラが、一覧の何番目か */
function currentIndex(cameras: MediaDeviceInfo[], video: HTMLVideoElement | null): number {
  const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
  const id = track?.getSettings().deviceId;
  return Math.max(0, cameras.findIndex((c) => c.deviceId === id));
}

function cameraErrorText(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "カメラを使えませんでした。カメラを使ってよいか聞かれたら「許可」を押してください";
  if (name === "NotFoundError") return "カメラが見つかりませんでした";
  if (name === "NotReadableError") return "カメラをほかのアプリが使っています。ほかのアプリをとじてください";
  return "カメラを開けませんでした";
}

function statusText(status: Status, error: string, mirrored: boolean): string {
  if (status === "error") return error;
  if (status === "starting") return "カメラを準備しています…";
  if (status === "found") return "マーカーの上に立体が乗りました。紙を動かすと、立体も動きます";
  return mirrored
    ? "印刷したマーカーを、手に持ってカメラに向けてください(黒い四角の全部がうつるように)"
    : "印刷したマーカーを机に置いて、カメラにうつしてください(黒い四角の全部がうつるように)";
}

/**
 * 毎フレーム、カメラの絵からマーカーをさがし、見つかったら立体をマーカーの上に重ねてかく。
 * 返すのは three.js のレンダラー(あとかたづけに使う)
 */
function runTracking(
  video: HTMLVideoElement,
  stage: HTMLElement,
  object: THREE.Object3D,
  rotationRef: { current: number },
  setStatus: (s: Status) => void,
  isStopped: () => boolean,
  setFrame: (id: number) => void,
): THREE.WebGLRenderer {
  // マーカーをさがす絵(小さくして計算を軽くする)
  const width = Math.min(DETECT_WIDTH, video.videoWidth);
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  const grab = document.createElement("canvas");
  grab.width = width;
  grab.height = height;
  const ctx = grab.getContext("2d", { willReadFrequently: true })!;
  const tracker = new MarkerTracker(width, height);

  // 立体をかく(カメラの映像の上に、すき通ったキャンバスを重ねる)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(200, 400, 300);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(tracker.fovDeg, width / height, 10, 20000);
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.visible = false;
  holder.add(object.clone());
  scene.add(holder);

  // 立体(m・Y が上)→ マーカー(mm・Z が紙から出る向き)
  const toMarker = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000));
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  let missed = LOST_FRAMES;
  let lastStatus: Status | null = null;
  const report = (s: Status) => s !== lastStatus && setStatus((lastStatus = s));

  const tick = () => {
    if (isStopped()) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h);

    ctx.drawImage(video, 0, 0, width, height);
    const pose = tracker.detect(ctx.getImageData(0, 0, width, height).data);
    if (pose) {
      pose.decompose(tmpPos, tmpQuat, scale);
      // はじめて見つけたときは そのまま、続けて見つけたときは前の位置となめらかにつなぐ
      if (missed >= LOST_FRAMES) {
        pos.copy(tmpPos);
        quat.copy(tmpQuat);
      } else {
        pos.lerp(tmpPos, SMOOTH);
        quat.slerp(tmpQuat, SMOOTH);
      }
      missed = 0;
    } else {
      missed++;
    }
    holder.visible = missed < LOST_FRAMES;
    if (holder.visible) {
      const spin = new THREE.Matrix4().makeRotationY(rotationRef.current);
      holder.matrix.compose(pos, quat, new THREE.Vector3(1, 1, 1)).multiply(toMarker).multiply(spin);
    }
    report(holder.visible ? "found" : "searching");
    renderer.render(scene, camera);
    setFrame(requestAnimationFrame(tick));
  };
  tick();
  return renderer;
}
