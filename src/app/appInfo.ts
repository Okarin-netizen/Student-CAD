// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// アプリの名前・作った人・ライセンス・版。2026-11-25 追加(全体の点検)。
// トップページ・「このアプリについて」などで同じ言葉を使うよう、ここにまとめる。
// 前は画面ごとに「Student CAD」「Student-CAD」と書き方がちがっていた。

/** アプリの名前(リポジトリ・manifest・README と同じ書き方) */
export const APP_NAME = "Student-CAD";

/** 作った人(著作者) */
export const APP_AUTHOR = "技術科　岡田";

/** 著作権の表示 */
export const APP_COPYRIGHT = `© 2026 ${APP_AUTHOR}`;

/** ライセンスの名前 */
export const APP_LICENSE = "MIT ライセンス";

/** ソースコードの置き場所 */
export const REPO_URL = "https://github.com/Okarin-netizen/Student-CAD";

/** 版の表示(例「0.9.0(2026-11-23・3869cc6)」)。値はビルドのとき vite.config.ts がうめる */
export function versionLabel(): string {
  const extra = [__APP_BUILD_DATE__, __APP_COMMIT__].filter(Boolean).join("・");
  return extra ? `${__APP_VERSION__}(${extra})` : __APP_VERSION__;
}
