# 使用しているオープンソースソフトウェア

| パッケージ | ライセンス | 用途 |
| --- | --- | --- |
| [replicad](https://github.com/sgenoud/replicad) | MIT | OpenCascade を扱うモデリングAPI |
| [replicad-opencascadejs](https://github.com/sgenoud/replicad) | LGPL-2.1-only | 3D形状カーネル OpenCascade の WebAssembly 版 |
| [@salusoft89/planegcs](https://github.com/Salusoft89/planegcs) | LGPL-2.0-or-later(package.json の記載) | FreeCAD の2Dスケッチ拘束ソルバの WebAssembly 版 |
| [three.js](https://github.com/mrdoob/three.js) | MIT | 3D描画 |
| [React](https://github.com/facebook/react) | MIT | 画面 |
| [Comlink](https://github.com/GoogleChromeLabs/comlink) | Apache-2.0 | Web Worker との通信 |

## LGPL のライブラリについて

replicad-opencascadejs と planegcs は LGPL です。このアプリでは、どちらも元の `.wasm` ファイルを改変せず、
アプリ本体とは別のファイルとして配信しています。利用者はこれらを同じ API を持つ別のビルドに差し替えることができます。
ソースコードは上の表のリンク先から入手できます。
