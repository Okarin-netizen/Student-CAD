// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// ボタンの説明(マウスをのせる・長押しすると出る)。
// ボタンの data-testid をキーにする。ボタンに data-tip があれば、そちらを使う。

export const TIPS: Record<string, string> = {
  // 上の帯
  undo: "1つ前の状態にもどします(Ctrl+Z)",
  redo: "もどした作業を やりなおします(Ctrl+Y)",
  "open-variables": "ほかの寸法の基準になる数に名前をつけます。数を変えると、それを使っている寸法がまとめて変わります",
  "open-file-menu": "新しく始める・ファイルをひらく・保存する・課題を作る",
  "file-new": "新しい作品を始めます。ひな形(名札・コースターなど)からも始められます",
  "file-open": "保存しておいた作品ファイル(.scad.json)をひらきます",
  "save-file": "作品をファイル(.scad.json)に保存します。ほかの端末でもひらけます",
  "file-assignment": "先生用: 大きさや使う作業などの条件をつけた課題ファイルを作ります",
  "pro-terms": "ボタンの名前を、Onshape・SolidWorks と同じ専門用語にします(もう一度えらぶと元にもどります)",
  // 手順の帯
  "new-sketch": "面をえらんで、その上に線・長方形・円などで形をかきます。立体づくりは ここから始めます",
  "new-extrude": "かいた形を まっすぐ持ち上げて立体にします。「けずる」にすると穴やみぞを作れます",
  "new-revolve": "かいた形を、軸のまわりにぐるっと回して立体にします(コップ・こま・びん)",
  "new-fillet": "立体の角(辺)をえらんで、丸めたり ななめに切り落としたりします",
  "open-more": "ミラー・パターン・ロフト・スイープ・シェルなど、そのほかの作業",
  "open-export": "3Dプリンターや ほかの CAD で使うファイル(STL・3MF・STEP)に書き出します",
  "open-drawing": "立体から図面(第三角法・等角図・キャビネット図)をかいて、印刷・PDF・DXF で出します",
  "open-submit": "作品・STL・図面・絵をまとめた提出用ファイル(ZIP)を作ります",
  // 作ったものの一覧
  "start-replay": "作った順に、形ができていく様子を再生します",
  "tree-edit": "えらんだ作業の数や形を直します",
  "tree-delete": "えらんだ作業を消します",
  // スケッチ
  "sketch-done": "スケッチを終わって、立体を作る作業へ進みます",
  "sketch-cancel": "このスケッチをやめます(かいた線は残りません)",
  // 作業の画面
  "op-ok": "この内容で作業を決めます",
  "op-flip": "向きを反対にします",
  "op-preview": "できあがりの形を見ながら決めます",
  // 図面
  "drawing-close": "3D の画面にもどります",
  "drawing-thirdAngle": "正面図・平面図・右側面図の3つで、形を正確に表します",
  "drawing-isometric": "3本の軸を 120° ずつにして、立体の感じが分かるようにかきます",
  "drawing-cabinet": "正面はそのままの形で、奥行きを 45° に半分の長さでかきます",
  "drawing-hidden": "見えない所の線(かくれ線)を点線でかきます",
  "drawing-dims": "寸法(長さ・直径・半径)を入れます",
  "drawing-with-iso": "三面図のあいている所に、等角図をそえます",
  "drawing-student-id": "4けたの学籍番号。表題欄と、保存するファイルの名前に入ります",
  "drawing-author": "作った人の名前。表題欄と、保存するファイルの名前に入ります",
  "drawing-material": "作る材料(PLA・ヒノキなど)。表題欄に入ります",
  "dim-add": "図の点(●)を2つタップすると、その間の寸法が入ります",
  "dim-erase": "いらない寸法の数字をタップして消します",
  "dim-reset": "足した寸法・消した寸法を、すべてもとにもどします",
  "drawing-print": "A4 横で印刷します。PDF に保存すると、ファイル名は「学籍番号_氏名_作品名」になります",
  "drawing-svg": "図面を SVG(きれいな絵のファイル)で保存します",
  "drawing-dxf": "図面を DXF で保存します。ほかの CAD でひらけます",
  "drawing-laser": "上から見た形を 1:1 の DXF にします。レーザー加工機のソフトでひらけます",
};

/** 要素の説明。data-tip、なければ data-testid から探す */
export function tipFor(el: Element): string | null {
  const own = el.getAttribute("data-tip");
  if (own) return own;
  const id = el.getAttribute("data-testid");
  return (id && TIPS[id]) || null;
}
