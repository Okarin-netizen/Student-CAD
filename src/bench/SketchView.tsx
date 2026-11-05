// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useRef, useState } from "react";
import type { PlateParams } from "./params";
import type { SolvedSketch } from "./plateSketch";

interface Props {
  params: PlateParams;
  sketch: SolvedSketch | null;
  onDrag: (patch: Partial<PlateParams>) => void;
}

type Handle = "corner" | "hole";

/** ドラッグ中の値を 0.5 mm に吸い付かせる(指で正確な位置は狙えないため) */
const SNAP = 0.5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/**
 * 2D スケッチ画面。形は拘束計算の結果をそのまま描く。
 * 右上の角と穴の中心は指でドラッグでき、ドラッグは「寸法を変える操作」になる。
 * 当たり判定は見た目より大きくして、指でもつかみやすくする。
 */
export function SketchView({ params, sketch, onDrag }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  // ドラッグ中は表示範囲を固定する(範囲が動くと指の位置とずれるため)
  const [frozenBox, setFrozenBox] = useState<string | null>(null);

  const span = Math.max(params.width, params.height) * 1.35 + 20;
  const liveBox = `${-span * 0.12} ${-span * 0.12} ${span} ${span}`;
  const viewBox = frozenBox ?? liveBox;
  const unit = span / 100; // 線の太さや文字の大きさを画面の大きさに合わせる

  const toSketch = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    // SVG は y が下向きなので、スケッチ座標(上向き)に直す
    return { x: p.x, y: -p.y };
  };

  const startDrag = (h: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(h);
    setFrozenBox(liveBox);
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const { x, y } = toSketch(e.clientX, e.clientY);
    if (dragging === "corner") {
      onDrag({ width: Math.max(5, snap(x)), height: Math.max(5, snap(y)) });
    } else {
      onDrag({ holeX: Math.max(0, snap(x)), holeY: Math.max(0, snap(y)) });
    }
  };

  const endDrag = () => {
    setDragging(null);
    setFrozenBox(null);
  };

  const corners = sketch?.corners;
  const hole = sketch?.hole;
  const flip = (y: number) => -y;

  return (
    <div className="sketch">
      <svg
        ref={svgRef}
        data-testid="sketch-view"
        viewBox={flipBox(viewBox)}
        onPointerMove={move}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label="スケッチ"
      >
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="var(--grid)" strokeWidth={unit * 0.15} />
          </pattern>
        </defs>
        <rect x={-1000} y={-1000} width={2000} height={2000} fill="url(#grid)" />
        <line x1={-1000} x2={1000} y1={0} y2={0} stroke="var(--axis-x)" strokeWidth={unit * 0.3} />
        <line x1={0} x2={0} y1={-1000} y2={1000} stroke="var(--axis-y)" strokeWidth={unit * 0.3} />

        {corners && (
          <>
            <polygon
              points={corners.map(([x, y]) => `${x},${flip(y)}`).join(" ")}
              fill="var(--sketch-fill)"
              stroke="var(--sketch-line)"
              strokeWidth={unit * 0.6}
            />
            {hole && <circle cx={hole.cx} cy={flip(hole.cy)} r={hole.r} fill="var(--bg)" stroke="var(--sketch-line)" strokeWidth={unit * 0.6} />}

            {/* 寸法の表示 */}
            <text x={corners[1][0] / 2} y={unit * 7} fontSize={unit * 4.5} textAnchor="middle" fill="var(--dim)">
              {fmt(params.width)}
            </text>
            <text
              x={corners[1][0] + unit * 3}
              y={flip(corners[2][1] / 2)}
              fontSize={unit * 4.5}
              fill="var(--dim)"
              dominantBaseline="middle"
            >
              {fmt(params.height)}
            </text>
            {hole && (
              <text x={hole.cx} y={flip(hole.cy + hole.r) - unit * 2} fontSize={unit * 3.8} textAnchor="middle" fill="var(--dim)">
                ⌀{fmt(params.holeDiameter)}
              </text>
            )}

            {/* つかめる点: 見た目は小さく、当たり判定は大きく */}
            <g className={dragging === "corner" ? "handle active" : "handle"}>
              <circle cx={corners[2][0]} cy={flip(corners[2][1])} r={unit * 1.8} fill="var(--handle)" />
              <circle
                data-testid="handle-corner"
                cx={corners[2][0]}
                cy={flip(corners[2][1])}
                r={unit * 7}
                fill="transparent"
                onPointerDown={startDrag("corner")}
              />
            </g>
            {hole && (
              <g className={dragging === "hole" ? "handle active" : "handle"}>
                <circle cx={hole.cx} cy={flip(hole.cy)} r={unit * 1.5} fill="var(--handle)" />
                <circle
                  data-testid="handle-hole"
                  cx={hole.cx}
                  cy={flip(hole.cy)}
                  r={unit * 6}
                  fill="transparent"
                  onPointerDown={startDrag("hole")}
                />
              </g>
            )}
          </>
        )}
      </svg>
      <p className="sketch-status">
        {sketch?.ok ? "🔒 形がすべて決まっています(完全定義)" : "形を計算しています…"}
      </p>
    </div>
  );
}

/** "x y w h"(スケッチ座標)を SVG の向き(y 下向き)の viewBox にする */
function flipBox(box: string): string {
  const [x, y, w, h] = box.split(" ").map(Number);
  return `${x} ${-(y + h)} ${w} ${h}`;
}

function fmt(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1)}`;
}
