// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// ひな形(白紙・名札・コースター など)をえらぶボタンの列。2026-11-25 追加(全体の点検)。
// トップページと「ファイル」→「新しく作る」で、同じボタンを べつべつに書いていたので1つにした。
// ひな形を足すときは doc/templates.ts に足し、アイコンを下の TEMPLATE_ICONS に足す。

import { TEMPLATES, type Template } from "../doc/templates";
import { Icon, type IconName } from "./Icon";

/** ひな形ごとの線のアイコン(ないものは白紙のアイコン) */
const TEMPLATE_ICONS: Record<string, IconName> = {
  blank: "blank",
  nameplate: "nameplate",
  coaster: "coaster",
  penstand: "penstand",
  keyholder: "keyholder",
};

interface Props {
  /** 列の class(トップページと ダイアログで ならべ方がちがう) */
  className: string;
  /** 列の data-testid */
  testId: string;
  /** ボタンの data-testid の頭(つづけて ひな形の id がつく。例 "template-" → "template-blank") */
  buttonTestIdPrefix: string;
  /** みどり(次に押すボタン)にする ひな形の id。なければ どれもみどりにしない */
  primaryId?: string;
  /** 押せなくする(トップページで、保存した作品を読みこんでいる間) */
  disabled?: boolean;
  onPick: (t: Template) => void;
}

export function TemplateButtons({ className, testId, buttonTestIdPrefix, primaryId, disabled, onPick }: Props) {
  return (
    <div className={className} data-testid={testId}>
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === primaryId ? "template primary" : "template"}
          onClick={() => onPick(t)}
          disabled={disabled}
          data-testid={`${buttonTestIdPrefix}${t.id}`}
        >
          <span className="template-icon" aria-hidden>
            <Icon name={TEMPLATE_ICONS[t.id] ?? "blank"} size={32} stroke={1.5} />
          </span>
          <strong>{t.label}</strong>
          <small>{t.summary}</small>
        </button>
      ))}
    </div>
  );
}
