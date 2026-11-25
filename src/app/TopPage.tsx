// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// トップページ(2026-11-25 追加)。
// URL を開くと いきなり作業画面だったので、はじめての生徒が「何から押すか」迷わないよう、入口を1枚おく。
// - つづきから: この端末に保存してある作品を開く(いちばん多い使い方なので、いちばん大きく・みどりに)
// - 新しく作る: 白紙か、課題のひな形をえらぶ(前の「ファイル」→「新しく」と同じひな形)
// - ファイルをひらく: 作品ファイル・先生の課題ファイルを開く
// - せつめい書(PDF)・このアプリについて
//
// 作業画面(App)は このページのうしろで先に準備を始めておく(計算部品の読みこみに数秒かかるため)。
// URL に ?cad をつけると、トップページをとばして作業画面から始まる(テストや、先生が直接開きたいとき)。

import { TEMPLATES, type Template } from "../doc/templates";
import { Icon } from "./Icon";
import { TEMPLATE_ICONS } from "./NewDialog";
import { versionLabel } from "./AboutDialog";

/** トップページから始めるか(?cad がなければ トップページ) */
export function startsAtTop(): boolean {
  return !new URLSearchParams(location.search).has("cad");
}

/** 生徒用のかんたん説明書(public/manual/ にある PDF) */
export const MANUAL_URL = `${import.meta.env.BASE_URL}manual/student-cad-manual.pdf`;

/** この端末に保存してある作品のようす */
export type SavedWork =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "some"; name: string; steps: number; assignment?: string };

interface Props {
  saved: SavedWork;
  onContinue: () => void;
  onNew: (t: Template) => void;
  onOpenFile: () => void;
  onAbout: () => void;
}

export function TopPage({ saved, onContinue, onNew, onOpenFile, onAbout }: Props) {
  // みどりのボタンは1画面に1つだけ: 作品があれば「つづきから」、なければ「白紙」
  const hasWork = saved.kind === "some";
  return (
    <div className="top-page" data-testid="top-page">
      <header className="top-head">
        <h1>
          <Icon name="cube" size={36} stroke={1.5} /> Student CAD
        </h1>
        <p>立体を作って、図面にする CAD</p>
      </header>

      <div className="top-body">
        <section className="top-side" aria-label="作品を開く">
          <ContinueButton saved={saved} onContinue={onContinue} />
          <button type="button" className="top-big" onClick={onOpenFile} data-testid="top-open">
            <Icon name="open" size={28} />
            <span className="top-big-text">
              <strong>ファイルをひらく</strong>
              <small>保存した作品や、先生の課題ファイル</small>
            </span>
          </button>
          <HowTo />
        </section>

        <section className="top-new" aria-labelledby="top-new-title">
          <h2 id="top-new-title">新しく作る</h2>
          {hasWork && <p className="top-note">新しく作ると、いまの作品「{saved.name}」は閉じます</p>}
          <div className="top-templates" data-testid="top-templates">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={saved.kind === "none" && t.id === "blank" ? "template primary" : "template"}
                onClick={() => onNew(t)}
                data-testid={`top-template-${t.id}`}
              >
                <span className="template-icon" aria-hidden>
                  <Icon name={TEMPLATE_ICONS[t.id] ?? "blank"} size={32} stroke={1.5} />
                </span>
                <strong>{t.label}</strong>
                <small>{t.summary}</small>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="top-foot">
        <a className="top-link" href={MANUAL_URL} target="_blank" rel="noreferrer" data-testid="top-manual">
          <Icon name="drawing" /> せつめい書(PDF)
        </a>
        <button type="button" className="top-link" onClick={onAbout} data-testid="top-about">
          <Icon name="help" /> このアプリについて
        </button>
        <span className="top-credit">
          版 {versionLabel()} ・ © 2026 技術科　岡田 ・ MIT ライセンス
        </span>
      </footer>
    </div>
  );
}

/** 「つづきから」。保存した作品がなければ、かわりに始め方の案内を出す */
function ContinueButton({ saved, onContinue }: { saved: SavedWork; onContinue: () => void }) {
  if (saved.kind === "none") {
    return (
      <p className="top-empty" data-testid="top-empty">
        まだ作品がありません。「新しく作る」から始めましょう。
      </p>
    );
  }
  const loading = saved.kind === "loading";
  return (
    <button
      type="button"
      className={loading ? "top-big" : "top-big primary"}
      onClick={onContinue}
      disabled={loading}
      data-testid="top-continue"
    >
      <Icon name="play" size={28} />
      <span className="top-big-text">
        <strong>つづきから</strong>
        <small>
          {loading
            ? "保存した作品をさがしています…"
            : `「${saved.name}」 作業 ${saved.steps} こ${saved.assignment ? `・課題「${saved.assignment}」` : ""}`}
        </small>
      </span>
    </button>
  );
}

/** 作り方の3つの手順(作業画面の下の手順バーと同じ番号・アイコン)。はじめての生徒が流れをつかめるように */
function HowTo() {
  return (
    <div className="top-howto" aria-label="作り方">
      <h2>作り方</h2>
      <ol>
        <li>
          <span className="step-num">1</span>
          <Icon name="sketch" /> 絵をかく
        </li>
        <li>
          <span className="step-num">2</span>
          <Icon name="extrude" /> 立体にする
        </li>
        <li>
          <span className="step-num">3</span>
          <Icon name="export" /> 書き出す・図面・提出
        </li>
      </ol>
      <p>わからないボタンは、長押し(パソコンはマウスをのせる)で説明が出ます</p>
    </div>
  );
}
