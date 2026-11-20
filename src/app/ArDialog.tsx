// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 「ARで見る」の画面。2026-11-20 追加。
// 作った立体を、タブレットのカメラごしに机の上へ実物大で置いて見る。
//   iPad・iPhone … AR クイックルック(USDZ)
//   Android      … WebXR
//   そのほか     … 使えないことと、使える端末を知らせる

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BodyMesh } from "../kernel/rebuild";
import { arSize, buildArObject, makeUsdz } from "./ar/arModel";
import { detectArMethod, type ArMethod } from "./ar/arSupport";
import { openQuickLook } from "./ar/quickLook";
import { startWebXrAr, type XrArControl, type XrPhase } from "./ar/webxrAr";
import { Icon } from "./Icon";
import { toast } from "./store";

interface Props {
  mesh: BodyMesh;
  onClose: () => void;
}

/** カメラの画面に出す案内 */
const PHASE_TEXT: Record<XrPhase, string> = {
  searching: "机や床にカメラを向けて、ゆっくり動かしてください",
  found: "みどりの輪の所をタップすると、立体を置きます",
  placed: "置けました。もう一度タップすると、その場所に置き直します",
};

export function ArDialog({ mesh, onClose }: Props) {
  const [method, setMethod] = useState<ArMethod | null>(null);
  const object = useMemo(() => buildArObject(mesh), [mesh]);
  const size = useMemo(() => arSize(mesh), [mesh]);

  // iPad 用のファイル(USDZ)は、ボタンを押す前に作っておく(押したその時に開かないと、Safari が開いてくれない)
  const [usdz, setUsdz] = useState<Uint8Array | null>(null);
  // Android の AR 画面のようす(null なら AR は開いていない)
  const [phase, setPhase] = useState<XrPhase | null>(null);
  const [starting, setStarting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<XrArControl | null>(null);

  useEffect(() => {
    let alive = true;
    void detectArMethod().then((m) => alive && setMethod(m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (method !== "quickLook") return;
    let alive = true;
    makeUsdz(object)
      .then((bytes) => alive && setUsdz(bytes))
      .catch(() => toast("AR 用のファイルを作れませんでした", "error"));
    return () => {
      alive = false;
    };
  }, [method, object]);

  // 画面をとじるときは、AR も終わる
  useEffect(() => () => controlRef.current?.end(), []);

  const startXr = async () => {
    if (!overlayRef.current) return;
    setStarting(true);
    try {
      controlRef.current = await startWebXrAr({
        object,
        overlayRoot: overlayRef.current,
        onPhase: setPhase,
        onEnd: () => {
          controlRef.current = null;
          setPhase(null);
        },
      });
    } catch {
      toast("カメラを開けませんでした。カメラを使ってよいか聞かれたら「許可」を押してください", "error");
    } finally {
      setStarting(false);
    }
  };

  const sizeText = `はば ${mm(size.width)}・おく行き ${mm(size.depth)}・高さ ${mm(size.height)}`;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ar-dialog" role="dialog" aria-label="ARで見る" data-testid="ar-dialog">
        <h3>ARで見る</h3>
        <p className="muted">
          カメラの画面に、作った立体を<b>実物と同じ大きさ</b>で出します。机の上に置いて、まわりから見てみましょう。
        </p>
        <p className="ar-size" data-testid="ar-size">{sizeText}</p>

        {method === null && <p className="muted">この端末で使えるか調べています…</p>}

        {method === "quickLook" && (
          <ol className="ar-steps">
            <li>「カメラで見る」を押す</li>
            <li>机や床にカメラを向けて、ゆっくり動かす</li>
            <li>立体が出たら、1本指で動かす・2本指で回す(大きさは実物大のまま変わりません)</li>
            <li>おわるときは、画面の上の × を押す</li>
          </ol>
        )}

        {method === "webxr" && (
          <ol className="ar-steps">
            <li>「カメラで見る」を押す(カメラを使ってよいか聞かれたら「許可」)</li>
            <li>机や床にカメラを向けて、ゆっくり動かす</li>
            <li>みどりの輪が出たら、画面をタップして置く</li>
            <li>おわるときは「おわる」を押す</li>
          </ol>
        )}

        {method === "none" && (
          <div className="panel-warning" data-testid="ar-unsupported">
            <b>この端末では AR が使えません。</b>
            <br />
            iPad・iPhone、または Android のスマホ・タブレット(Chrome)で、このページを開くと使えます。
            作品は「ファイル」→「ファイルに保存」で、ほかの端末に持っていけます。
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose} data-testid="ar-close">
            とじる
          </button>
          {method === "quickLook" && (
            <button type="button" className="primary" disabled={!usdz} onClick={() => usdz && openQuickLook(usdz)} data-testid="ar-start">
              <Icon name="ar" /> {usdz ? "カメラで見る" : "準備しています…"}
            </button>
          )}
          {method === "webxr" && (
            <button type="button" className="primary" disabled={starting} onClick={() => void startXr()} data-testid="ar-start">
              <Icon name="ar" /> カメラで見る
            </button>
          )}
        </div>
      </div>

      {/* Android の AR 画面で、カメラの映像の上に出す文字とボタン */}
      {createPortal(
        <div ref={overlayRef} className="ar-overlay" hidden={phase === null}>
          <p className="ar-hint" role="status">{phase ? PHASE_TEXT[phase] : ""}</p>
          <div className="ar-buttons">
            <button type="button" onClick={() => controlRef.current?.rotate()} disabled={phase !== "placed"}>
              <Icon name="revolve" /> まわす
            </button>
            <button type="button" className="primary" onClick={() => controlRef.current?.end()}>
              おわる
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** mm の数を見やすくする(小数は1けたまで) */
function mm(v: number): string {
  return `${Math.round(v * 10) / 10}mm`;
}
