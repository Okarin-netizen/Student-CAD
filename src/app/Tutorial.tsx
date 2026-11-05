// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// はじめての人向けのガイド。押すボタンを光らせて、言葉で何をするかを伝える。
// 生徒が言われたことをやると、自動で次へ進む(「次へ」を押さなくてよい)。
// 画面の操作はふさがないので、まちがえてもそのまま続けられる。

import { useEffect, useState } from "react";
import type { State } from "./store";

export interface TutorialStep {
  /** 光らせるボタン(data-testid)。なければ画面の下に説明だけ出す */
  target?: string;
  title: string;
  text: string;
  /** これが true になったら次へ進む。ないときは「次へ」ボタンを出す */
  done?: (s: State) => boolean;
}

const lines = (s: State) => s.draftSketch?.entities.filter((e) => e.type === "line" || e.type === "circle").length ?? 0;
const has = (s: State, type: string) => s.doc.features.some((f) => f.type === type);

/** ガイドの手順: 四角い板を作り、角を丸めて、書き出すまで */
export const TUTORIAL: TutorialStep[] = [
  {
    title: "ようこそ!",
    text: "これから、四角い板を作って角を丸めるまでを、いっしょにやってみます。光っているところを押していきましょう。",
  },
  {
    target: "new-sketch",
    title: "1. 絵をかく",
    text: "立体は「絵(スケッチ)」から作ります。「絵をかく」を押しましょう。",
    done: (s) => s.mode.kind !== "model",
  },
  {
    target: "plane-top",
    title: "2. かく面をえらぶ",
    text: "床と同じ向きの「上の面」にかきます。「上の面」を押しましょう。",
    done: (s) => s.mode.kind === "sketch",
  },
  {
    target: "tool-rect",
    title: "3. 長方形をかく",
    text: "「長方形」を押してから、方眼の上で 2 か所をタップすると四角がかけます(1か所目が角、2か所目がその反対の角)。",
    done: (s) => lines(s) >= 4 || has(s, "sketch"),
  },
  {
    target: "sketch-done",
    title: "4. かけたら完成",
    text: "寸法の数はあとから直せます。いまは「かけた!」を押しましょう。",
    done: (s) => has(s, "sketch") && s.mode.kind !== "sketch",
  },
  {
    target: "op-ok",
    title: "5. 立体にする",
    text: "四角が押し出されて板になりました。あつさは数を押すと変えられます。よければ「OK」を押しましょう。",
    done: (s) => has(s, "extrude") && s.mode.kind === "model",
  },
  {
    target: "new-fillet",
    title: "6. 角を丸める",
    text: "1本指で立体を回して、いろいろな向きから見てみましょう。見られたら「角を丸める」を押します。",
    done: (s) => s.mode.kind === "op" && s.draftOp?.type === "fillet",
  },
  {
    target: "op-ok",
    title: "7. 丸める辺をえらぶ",
    text: "丸めたい辺(線)をタップすると、オレンジになります。いくつかえらんだら「OK」を押しましょう。",
    done: (s) => has(s, "fillet") && s.mode.kind === "model",
  },
  {
    target: "feature-tree",
    title: "8. れきし",
    text: "左には、やった作業が順番にならびます。作業をタップして「なおす」を押すと、あとから数を変えられます。",
  },
  {
    target: "open-export",
    title: "できました! 🎉",
    text: "「書き出す」で 3D プリンター用のファイルに、「図面」で第三角法などの図にできます。課題があるときは「提出」で先生に出します。",
  },
];

const SEEN_KEY = "student-cad:tutorialSeen";

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 覚えられなくても、毎回すすめるだけ
  }
}

interface Props {
  state: State;
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}

interface Found {
  /** 光らせるボタンの位置 */
  rect: DOMRect;
  /** そのボタンが入っているパネル(押し出しの設定など)の位置。吹き出しでパネルの中をかくさないために使う */
  panel: DOMRect | null;
}

/** 光らせる枠の位置。ボタンが動いたり出たり消えたりするので、少しずつ見直す */
function useTarget(target: string | undefined): Found | null {
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!target) {
      setFound(null);
      return;
    }
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${target}"]`);
      const next = el && el.offsetParent !== null ? { rect: el.getBoundingClientRect(), panel: el.closest(".panel")?.getBoundingClientRect() ?? null } : null;
      setFound((old) => (old && next && same(old.rect, next.rect) && same(old.panel, next.panel) ? old : next));
    };
    find();
    const t = setInterval(find, 250);
    return () => clearInterval(t);
  }, [target]);
  return found;
}

const BUBBLE_W = 340;

/**
 * 吹き出しの位置。
 * - ボタンがパネルの中にあれば、パネルの右どなりに出す(パネルの中の数や項目をかくさない)
 * - それ以外は、ボタンが画面の上半分なら下に、下半分なら上に出す
 */
function bubbleStyle({ rect, panel }: Found): React.CSSProperties {
  if (panel && panel.right + 16 + BUBBLE_W < window.innerWidth) {
    return { left: panel.right + 16, top: Math.max(12, Math.min(rect.top - 40, window.innerHeight - 220)) };
  }
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - BUBBLE_W / 2), window.innerWidth - BUBBLE_W - 12);
  const below = rect.top + rect.height / 2 < window.innerHeight / 2;
  return below ? { left, top: (panel?.bottom ?? rect.bottom) + 14 } : { left, bottom: window.innerHeight - rect.top + 14 };
}

const same = (a: DOMRect | null, b: DOMRect | null) => (a && b ? a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height : a === b);

export function Tutorial({ state, step, onStep, onClose }: Props) {
  const s = TUTORIAL[step];
  const found = useTarget(s?.target);
  const rect = found?.rect ?? null;
  const last = step === TUTORIAL.length - 1;

  // やることができたら次へ
  useEffect(() => {
    if (s?.done?.(state)) onStep(step + 1);
  }, [state, s, step, onStep]);

  if (!s) return null;

  const bubble = found ? bubbleStyle(found) : {};

  return (
    <>
      {rect && (
        <div
          className="tutorial-ring"
          aria-hidden
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className={`tutorial-bubble ${rect ? "" : "floating"}`} style={bubble} role="dialog" aria-label="使い方ガイド" data-testid="tutorial">
        <div className="tutorial-progress" aria-label={`${step + 1} / ${TUTORIAL.length}`}>
          {TUTORIAL.map((_, i) => (
            <span key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <strong className="tutorial-title">{s.title}</strong>
        <p>{s.text}</p>
        <div className="tutorial-actions">
          <button type="button" onClick={onClose} data-testid="tutorial-close">
            {last ? "とじる" : "ガイドをやめる"}
          </button>
          {!s.done && !last && (
            <button type="button" className="primary" onClick={() => onStep(step + 1)} data-testid="tutorial-next">
              {step === 0 ? "はじめる" : "次へ"}
            </button>
          )}
          {last && (
            <button type="button" className="primary" onClick={onClose} data-testid="tutorial-finish">
              ✓ おわり
            </button>
          )}
        </div>
      </div>
    </>
  );
}
