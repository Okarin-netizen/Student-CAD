// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useDismiss } from "./useDismiss";

/** メニューの1行 */
export interface MenuItem {
  /** テスト用の名前(data-testid) */
  id: string;
  icon: IconName;
  label: string;
  /** 説明(あれば、名前の下に小さく出す) */
  desc?: string;
  run: () => void | Promise<void>;
}

interface Props {
  /** メニューをひらくボタン */
  icon: IconName;
  label: string;
  testId: string;
  buttonClass?: string;
  disabled?: boolean;
  /** メニューの見出し(読み上げ用)と、つける class */
  menuLabel: string;
  menuClass?: string;
  items: MenuItem[];
  /** この値が変わったら とじる(画面が切りかわったときなど) */
  closeKey?: unknown;
  /**
   * まだ使えないとき(うすく見せる)に、押したら呼ぶ関数。あれば、メニューはひらかない。
   * disabled とちがって押せるので、何を先にすればよいかを案内できる。2026-11-10 追加
   */
  onNotReady?: () => void;
}

/**
 * ボタンを押すと下にひらくメニュー(「ファイル」「そのほか」「書き出す」)。
 * 外をタップする・Esc・項目をえらぶ・closeKey が変わると とじる。
 */
export function DropMenu({ icon, label, testId, buttonClass, disabled, menuLabel, menuClass, items, closeKey, onNotReady }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  useEffect(() => setOpen(false), [closeKey]);

  return (
    <div className="export-wrap" ref={ref}>
      <button
        type="button"
        className={[buttonClass, onNotReady ? "not-ready" : ""].filter(Boolean).join(" ") || undefined}
        onClick={() => (onNotReady ? onNotReady() : setOpen((v) => !v))}
        disabled={disabled}
        aria-disabled={onNotReady ? true : undefined}
        aria-expanded={open}
        data-testid={testId}
      >
        <Icon name={icon} /> {label}
      </button>
      {open && (
        <div className={menuClass ? `export-menu ${menuClass}` : "export-menu"} role="menu" aria-label={menuLabel}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={item.id}
              onClick={() => {
                setOpen(false);
                void item.run();
              }}
            >
              {item.desc ? (
                <>
                  <strong>
                    <Icon name={item.icon} /> {item.label}
                  </strong>
                  <small>{item.desc}</small>
                </>
              ) : (
                <>
                  <Icon name={item.icon} />
                  {item.label}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
