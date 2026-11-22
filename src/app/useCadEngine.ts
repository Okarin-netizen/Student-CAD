// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 起動のときの準備: 形を計算する Worker、スケッチ用の拘束計算(planegcs)、保存してあった作品の読み込み。
// 2026-11-22 App.tsx から分けた(App.tsx が長く、どこで何を準備しているか読みにくかったため)。

import { useEffect, useRef, useState, type RefObject } from "react";
import { make_gcs_wrapper, type GcsWrapper } from "@salusoft89/planegcs";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { CadClient } from "./cadClient";
import { loadDoc } from "./persist";
import { replaceDoc, setState, toast } from "./store";

const RELOAD = "ページを読み込み直してください";

export interface CadEngine {
  /**
   * Worker への窓口。画面ができたあと(最初の useEffect のあと)から入る。
   * ref のまま返すのは、同じ描画の中のあとの useEffect からも、入ったものを使えるようにするため
   */
  clientRef: RefObject<CadClient | null>;
  /** スケッチの画面で使う拘束計算。読み込めるまでは null */
  gcs: GcsWrapper | null;
  /** 形の計算の準備ができたか */
  ready: boolean;
  /** 保存してあった作品を読み終えたか(読み終えるまでは自動保存しない) */
  loaded: boolean;
}

export function useCadEngine(): CadEngine {
  const clientRef = useRef<CadClient | null>(null);
  const [gcs, setGcs] = useState<GcsWrapper | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const client = new CadClient();
    clientRef.current = client;
    client.onResult = (r, doc) => setState({ result: r, resultDoc: doc });
    client.onBusy = (busy) => setState({ busy });
    client.onError = () => toast(`形の計算でエラーが出ました。直らないときは${RELOAD}`, "error");
    client
      .init()
      .then(() => alive && setReady(true))
      .catch(() => alive && toast(`計算の準備に失敗しました。${RELOAD}`, "error"));

    // 読み込めないと、スケッチの画面が「準備しています…」のまま止まるので、知らせる(2026-11-22)
    make_gcs_wrapper(gcsWasmUrl)
      .then((g) => alive && setGcs(g))
      .catch(() => alive && toast(`スケッチの準備に失敗しました。${RELOAD}`, "error"));

    void loadDoc().then((doc) => {
      if (!alive) return;
      if (doc) replaceDoc(doc);
      setLoaded(true);
    });

    return () => {
      alive = false;
      client.terminate();
    };
  }, []);

  return { clientRef, gcs, ready, loaded };
}
