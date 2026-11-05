# Student-CAD

中学生がタブレット(iPad / Chromebook / Windows タブレット)のブラウザだけで使える、2D・3D CAD を目指すプロジェクトです。
操作の考え方は Onshape や SolidWorks と同じ「スケッチ → 寸法と拘束 → 押し出し → 作業のれきし」にして、
将来プロ向けの CAD にそのまま移れるようにします。

- 開発計画: https://claude.ai/artifact/XT2RhuNKccpJr8WNEXvwmz
- いまの段階: **フェーズ0(技術検証)** … [docs/phase0.md](docs/phase0.md)

## 仕組み

| 層 | 使っているもの |
| --- | --- |
| 画面 | React + TypeScript(Vite) |
| 3D描画 | three.js |
| 3D形状計算 | replicad + OpenCascade(WebAssembly) |
| 2D拘束計算 | planegcs(FreeCAD のソルバの WebAssembly 版) |
| 計算の実行場所 | Web Worker(画面を止めない) |

サーバーは使わず、ブラウザの中だけで動きます。

## 開発

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 単体テスト(拘束計算・立体化・STL)
npm run test:e2e   # iPad 横向き・Chromebook の画面サイズでの操作テスト
npm run build
```

`main` に入ると GitHub Actions で GitHub Pages に公開されます(初回のみ、Settings → Pages の Source を「GitHub Actions」にしてください)。

使用している OSS とライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を見てください。
