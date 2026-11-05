let counter = 0;

/** 文書の中で重ならない短い id を作る */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** 「スケッチ1」「スケッチ2」…のように、まだ使われていない番号の名前を返す */
export function nextName(base: string, existing: string[]): string {
  for (let i = 1; ; i++) {
    const name = `${base}${i}`;
    if (!existing.includes(name)) return name;
  }
}
