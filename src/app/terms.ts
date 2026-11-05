// 画面の言葉。ふだんはやさしい言葉、設定で Onshape/SolidWorks と同じ専門用語に切り替えられる。
const TERMS = {
  sketch: ["スケッチ", "スケッチ"],
  newSketch: ["絵をかく", "スケッチ"],
  extrude: ["立体にする", "押し出し"],
  extrudeName: ["押し出し", "押し出し"],
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
