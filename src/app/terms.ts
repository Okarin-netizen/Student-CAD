// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 画面の言葉。ふだんはやさしい言葉、設定で Onshape/SolidWorks と同じ専門用語に切り替えられる。
const TERMS = {
  sketch: ["絵", "スケッチ"],
  newSketch: ["絵をかく", "スケッチ"],
  extrude: ["立体にする", "押し出し"],
  extrudeName: ["押し出し", "押し出し"],
  revolve: ["回して立体にする", "回転"],
  revolveName: ["回転", "回転"],
  fillet: ["角を丸める", "フィレット"],
  chamfer: ["角を落とす", "面取り"],
  mirror: ["対称にする", "ミラー"],
  pattern: ["ならべる", "パターン"],
  loft: ["つなぐ", "ロフト"],
  shell: ["くりぬく", "シェル"],
  sweep: ["なぞる", "スイープ"],
  linear: ["まっすぐ", "直線パターン"],
  circular: ["円のまわり", "円形パターン"],
  variables: ["基準の数", "変数"],
  text: ["文字", "テキスト"],
  add: ["くっつける", "追加"],
  cut: ["けずる", "除去"],
  history: ["作業のれきし", "フィーチャーツリー"],
  constraint: ["きまり", "拘束"],
  dimension: ["寸法", "寸法"],
  construction: ["補助線", "コンストラクション"],
  horizontal: ["水平", "水平"],
  vertical: ["垂直", "垂直"],
  coincident: ["くっつける", "一致"],
  parallel: ["平行", "平行"],
  perpendicular: ["直角", "垂直(直交)"],
  equal: ["同じ長さ", "等しい"],
  fullyDefined: ["形がすべて決まりました", "完全定義"],
} as const;

export type TermKey = keyof typeof TERMS;

export function term(key: TermKey, pro: boolean): string {
  return TERMS[key][pro ? 1 : 0];
}

/**
 * 作業の名前(「押し出し1」など)を、画面に出す言葉にする。2026-11-10 追加。
 * 設計図には専門用語の名前で保存されている(ファイルは変えない)。ふだんの言葉のときは、
 * ボタンと同じ言葉(「立体にする」→「立体1」、「絵をかく」→「絵1」)に読みかえて見せる。
 * 生徒が自分でつけた名前など、決まった形でない名前はそのまま見せる。
 */
const EASY_NAMES: Record<string, string> = {
  スケッチ: "絵",
  押し出し: "立体",
  ミラー: "対称",
  パターン: "ならべ",
  ロフト: "つなぎ",
  スイープ: "なぞり",
  面取り: "角落とし",
};

export function featureLabel(name: string, pro: boolean): string {
  if (pro) return name;
  const m = /^(\D+?)(\d+)$/.exec(name);
  const easy = m && EASY_NAMES[m[1]];
  return easy ? `${easy}${m[2]}` : name;
}

/** 計算のエラー文などに出てくる「スケッチ1」のような名前を、画面の言葉に読みかえる */
export function withFeatureLabels(text: string, names: string[], pro: boolean): string {
  if (pro) return text;
  return names.reduce((t, n) => t.split(`「${n}」`).join(`「${featureLabel(n, pro)}」`), text);
}
