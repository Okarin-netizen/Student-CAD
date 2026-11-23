// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 「このアプリについて」: 版・作った人・ライセンス・オフラインの様子・保存の場所を出す(2026-11-23 追加)。
// 不具合を聞くとき「どの版か」がわかるように、また、ほかの学校で使うときにクレジットが見えるようにする。

import { useEscape } from "./useEscape";
import { usePwaState } from "./pwa";

interface Props {
  onClose: () => void;
}

/** 版の表示(例「0.9.0(2026-11-23・3869cc6)」) */
export function versionLabel(): string {
  const extra = [__APP_BUILD_DATE__, __APP_COMMIT__].filter(Boolean).join("・");
  return extra ? `${__APP_VERSION__}(${extra})` : __APP_VERSION__;
}

/** オフラインの様子を、生徒にわかる言葉で */
function offlineText(offlineReady: boolean): string {
  if (!("serviceWorker" in navigator)) return "このブラウザでは、ネットにつながっているときだけ開けます";
  return offlineReady ? "この端末にしまってあります。ネットがなくても開けます" : "この端末にしまっているところです(ネットにつないだまま、しばらく待ってください)";
}

export function AboutDialog({ onClose }: Props) {
  useEscape(onClose);
  const { offlineReady } = usePwaState();
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog about-dialog" role="dialog" aria-label="このアプリについて" data-testid="about-dialog">
        <h3>Student-CAD について</h3>
        <dl className="about-list">
          <dt>版</dt>
          <dd data-testid="about-version">{versionLabel()}</dd>
          <dt>作った人</dt>
          <dd>技術科　岡田</dd>
          <dt>ライセンス</dt>
          <dd>MIT ライセンス。著作権の表示を残せば、改変・再配布・授業での利用は自由です</dd>
          <dt>オフライン</dt>
          <dd data-testid="about-offline">{offlineText(offlineReady)}</dd>
          <dt>保存の場所</dt>
          <dd>作品と学籍番号・氏名は、この端末の中だけに保存します。外のサーバーには送りません</dd>
        </dl>
        <p className="muted">
          使っている部品(OpenCascade・planegcs・three.js・React など)と、そのライセンスは{" "}
          <a href="https://github.com/Okarin-netizen/Student-CAD/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">
            THIRD_PARTY_NOTICES
          </a>{" "}
          にあります。
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} data-testid="about-close">
            とじる
          </button>
        </div>
      </div>
    </div>
  );
}
