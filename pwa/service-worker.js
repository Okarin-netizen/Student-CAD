// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// オフラインで開くための Service Worker(2026-11-23 追加)。
// これはひな形で、vite.config.ts の pwaPlugin がビルドのときに
// 下の BUILD_ID(版の名前)と PRECACHE(しまっておくファイルの一覧)の中身をうめて dist/sw.js にする。
//
// 動き:
// 1. はじめて開いたとき、アプリの全ファイル(計算部品 約23MB をふくむ)を端末にしまう
// 2. 次からは、ネットがなくても、しまったファイルで開く(1人1台の端末なので、授業ごとの読みこみがいらない)
// 3. 新しい版を公開すると、裏で新しいファイルをしまい、画面に「新しい版があります」と出す。
//    「開き直す」を押すまでは、前の版のまま動く(作業のとちゅうで画面が変わらないように)

const BUILD_ID = "%BUILD_ID%";
const PRECACHE = ["%PRECACHE%"];
const CACHE = `student-cad-${BUILD_ID}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// 古い版のファイルを消す(新しい版が動き出したとき)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("student-cad-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面の「開き直す」から呼ばれる。待っている新しい版を、すぐに動かす
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // ページそのもの(?bench などがついていても)は、しまってある index.html を出す。
  // ただし せつめい書(PDF)など、名前に .pdf などがつくファイルを開くときは、そのファイルを出す(2026-11-25)
  const path = new URL(req.url).pathname;
  const navigate = req.mode === "navigate" && !/\.(?!html$)[a-z0-9]+$/i.test(path);
  const key = navigate ? "./" : req.url;
  // ignoreVary: しまったときと読むときで、サーバーの Vary(Origin など)の見出しがちがっても同じファイルとして出す
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(key, { ignoreSearch: navigate, ignoreVary: true }).then((hit) => hit ?? fetch(req))),
  );
});
