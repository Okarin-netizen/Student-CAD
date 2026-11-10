// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 3D の上に重なる作業パネル(立体にする・面をえらぶ など)が、どれだけ 3D をかくしているかを測る。
// 2026-11-10 追加: パネルが立体にかぶさって、あつさを変えても見えにくかったため。
// 横長の画面ではパネルは左上、縦長の画面(820px 以下)では左下に出るので、左か下のどちらかとして返す。

import { useLayoutEffect, useState, type RefObject } from "react";
import type { Cover } from "./Viewer3D";

const NONE: Cover = { left: 0, bottom: 0 };
/** パネルと立体のあいだに空ける すきま(px) */
const GAP = 12;

/**
 * stageRef の中の `.panel`(作業パネル)をみはり、かくれている はばを返す。
 * panelKey はいま出ているパネルの名前(変わったら測り直す)。null のとき(パネルなし)は 0。
 */
export function usePanelCover(stageRef: RefObject<HTMLElement | null>, panelKey: string | null): Cover {
  const [cover, setCover] = useState<Cover>(NONE);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const panel = panelKey ? stage?.querySelector<HTMLElement>(":scope > .panel") : null;
    if (!stage || !panel) {
      setCover(NONE);
      return;
    }
    const measure = () => {
      const s = stage.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      // パネルの右がわと上がわのうち、広く空いているほうに立体をうつす
      // (横長の画面では右がわ、縦長の画面ではパネルが下に出るので上がわになる)
      const left = Math.round(p.right - s.left + GAP);
      const bottom = Math.round(s.bottom - p.top + GAP);
      const rightArea = (s.width - left) * s.height;
      const topArea = s.width * (s.height - bottom);
      const next = rightArea >= topArea ? { left, bottom: 0 } : { left: 0, bottom };
      // 数 px の変化では動かさない(立体がゆれて見えないように)
      setCover((old) => (Math.abs(old.left - next.left) < 8 && Math.abs(old.bottom - next.bottom) < 8 ? old : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stageRef, panelKey]);

  return cover;
}
