// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 新しい版をしまい終えたときに出す帯(2026-11-23 追加)。
// 作業のとちゅうで画面が変わらないよう、自動では切りかえず、生徒が「開き直す」を押したときだけ切りかえる。

import { applyUpdate, usePwaState } from "./pwa";

export function UpdateBanner() {
  const { updateReady } = usePwaState();
  if (!updateReady) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <span>新しい版があります。きりのよいところで開き直してください</span>
      <button type="button" onClick={applyUpdate} data-testid="update-apply">
        開き直す
      </button>
    </div>
  );
}
