// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 画面の途中で思わぬまちがい(バグ)が起きたときに、まっ白な画面のまま止まらないようにする。
// 作品は自動保存されているので、読み込み直すか、いまの作品をファイルに保存してから新しく始められる。

import { Component, type ReactNode } from "react";
import { emptyDocument } from "../doc/types";
import { downloadFile, saveDoc } from "./persist";
import { docForSave, getState } from "./store";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorScreen extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("画面でまちがいが起きました", error);
  }

  /** いまの作品をファイルに保存する(先生に見せる・あとで「ひらく」で戻すため) */
  private saveFile = () => {
    const doc = docForSave(getState());
    downloadFile(JSON.stringify(doc, null, 1), `${doc.name || "作品"}.scad.json`, "application/json");
  };

  /** 自動保存してある作品を空にして、はじめから */
  private startOver = async () => {
    if (!window.confirm("いまの作品を消して、新しく始めますか?(先に「ファイルに保存」をしておくと、あとで「ひらく」で戻せます)")) return;
    await saveDoc(emptyDocument());
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen" role="alert" data-testid="error-screen">
        <h2>うまく動かなくなりました</h2>
        <p>作品は自動で保存されています。まず「読み込み直す」をためしてください。</p>
        <p>何度も同じ画面になるときは、作品をファイルに保存して、先生に見せてください。</p>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={() => location.reload()} data-testid="error-reload">
            読み込み直す
          </button>
          <button type="button" onClick={this.saveFile} data-testid="error-save">
            ファイルに保存
          </button>
          <button type="button" className="danger" onClick={() => void this.startOver()} data-testid="error-new">
            新しく始める
          </button>
        </div>
        <p className="muted">くわしいこと: {this.state.error.message}</p>
      </div>
    );
  }
}
