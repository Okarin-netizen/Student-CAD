import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS, PARAM_SPECS, type PlateParams } from "./model/params";
import type { SolvedSketch } from "./sketch/plateSketch";
import type { MeshData } from "./kernel/buildPlate";
import { createCadWorker, type CadClient } from "./worker/client";
import type { InitReport, RebuildResult, Timings } from "./worker/types";
import { SketchView } from "./view/SketchView";
import { Viewer3D } from "./view/Viewer3D";
import { DimensionInput } from "./ui/DimensionInput";
import { deviceInfo, jsHeapMB, ms, type MetricsReport, type StressResult } from "./metrics";

type Phase = "loading" | "ready" | "error";

export function App() {
  const cadRef = useRef<CadClient | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState<PlateParams>(DEFAULT_PARAMS);
  const [sketch, setSketch] = useState<SolvedSketch | null>(null);
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [initReport, setInitReport] = useState<InitReport | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [last, setLast] = useState<(Timings & { triangles: number }) | null>(null);
  const [stress, setStress] = useState<StressResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 寸法が続けて変わったとき(ドラッグ中など)は、計算待ちを溜めずに最新の寸法だけ計算する
  const pendingRef = useRef<PlateParams | null>(null);
  const runningRef = useRef(false);

  const applyResult = useCallback((r: RebuildResult) => {
    if (r.kind === "ok") {
      setSketch(r.sketch);
      setMesh(r.mesh);
      setProblems([]);
      setLast({ ...r.timings, triangles: r.triangleCount });
    } else {
      if (r.sketch) setSketch(r.sketch);
      setProblems(r.problems);
      if (r.detail) console.warn(r.detail);
    }
  }, []);

  const pump = useCallback(async () => {
    const cad = cadRef.current;
    if (!cad || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      while (pendingRef.current) {
        const p = pendingRef.current;
        pendingRef.current = null;
        applyResult(await cad.rebuild(p, true));
      }
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [applyResult]);

  const update = useCallback(
    (patch: Partial<PlateParams>) => {
      setParams((prev) => {
        const next = { ...prev, ...patch };
        pendingRef.current = next;
        queueMicrotask(pump);
        return next;
      });
    },
    [pump],
  );

  useEffect(() => {
    const { cad, terminate } = createCadWorker();
    cadRef.current = cad;
    let cancelled = false;
    (async () => {
      try {
        const report = await cad.init();
        if (cancelled) return;
        setInitReport(report);
        const first = await cad.rebuild(DEFAULT_PARAMS, false);
        if (cancelled) return;
        applyResult(first);
        setReadyMs(performance.now());
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setLoadError(String(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      cadRef.current = null;
      terminate();
    };
  }, [applyResult]);

  const exportStl = async () => {
    const cad = cadRef.current;
    if (!cad) return;
    const buf = await cad.exportSTL();
    const url = URL.createObjectURL(new Blob([buf], { type: "model/stl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plate-${params.width}x${params.height}x${params.thickness}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /** 寸法を20回変えて、計算時間の平均と最大を測る */
  const runStress = async () => {
    const cad = cadRef.current;
    if (!cad || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    const runs = 20;
    let total = 0, max = 0, solve = 0, build = 0, meshT = 0, failures = 0;
    try {
      for (let i = 0; i < runs; i++) {
        const p = { ...params, width: params.width + (i % 5) * 2, height: params.height + (i % 3), cornerRadius: (i % 4) + 1 };
        const t0 = performance.now();
        const r = await cad.rebuild(p, true);
        const dt = performance.now() - t0;
        if (r.kind !== "ok") {
          failures++;
          continue;
        }
        total += dt;
        max = Math.max(max, dt);
        solve += r.timings.solveMs;
        build += r.timings.buildMs;
        meshT += r.timings.meshMs;
        applyResult(r);
      }
      const ok = runs - failures || 1;
      setStress({
        runs,
        avgTotalMs: total / ok,
        maxTotalMs: max,
        avgSolveMs: solve / ok,
        avgBuildMs: build / ok,
        avgMeshMs: meshT / ok,
        failures,
      });
      // 最後に元の寸法へ戻す
      applyResult(await cad.rebuild(params, true));
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  };

  const report: MetricsReport = {
    measuredAt: new Date().toISOString(),
    device: deviceInfo(),
    readyMs,
    init: initReport,
    last,
    stress,
    jsHeapMB: jsHeapMB(),
  };

  const copyReport = async () => {
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない端末では、下の欄から手でコピーしてもらう
      document.querySelector<HTMLTextAreaElement>("#report-text")?.select();
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Student CAD <small>技術検証版</small></h1>
        <ol className="steps" aria-label="作業の流れ">
          <li className="done">① 平面をえらぶ</li>
          <li className="current">② 絵をかく(スケッチ)</li>
          <li className="current">③ 立体にする(押し出し)</li>
        </ol>
        <span className={`status status-${phase}`} data-testid="status">
          {phase === "loading" && "準備中…(初回は数十秒かかることがあります)"}
          {phase === "ready" && (busy ? "計算中…" : "準備完了")}
          {phase === "error" && "読み込みに失敗しました"}
        </span>
      </header>

      {phase === "error" && <p className="problems">{loadError}</p>}

      <main className="workspace">
        <section className="pane" aria-label="スケッチ">
          <h2>スケッチ(2D)</h2>
          <SketchView params={params} sketch={sketch} onDrag={update} />
        </section>
        <section className="pane" aria-label="3Dビュー">
          <h2>立体(3D)</h2>
          <Viewer3D mesh={mesh} />
        </section>
      </main>

      <section className="panel" aria-label="寸法">
        {problems.length > 0 && (
          <ul className="problems" data-testid="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="dims">
          {PARAM_SPECS.map((spec) => (
            <DimensionInput key={spec.key} spec={spec} value={params[spec.key]} onChange={(v) => update({ [spec.key]: v })} />
          ))}
        </div>
        <div className="actions">
          <button type="button" className="primary" data-testid="export-stl" disabled={phase !== "ready" || !mesh} onClick={exportStl}>
            3Dプリント用に書き出す(STL)
          </button>
        </div>
      </section>

      <details className="metrics" open>
        <summary>計測結果(技術検証用)</summary>
        <dl>
          <dt>準備完了まで</dt>
          <dd data-testid="ready-ms">{ms(readyMs)}</dd>
          <dt>3Dカーネル(OpenCascade)の起動</dt>
          <dd>{ms(initReport?.ocInitMs)}</dd>
          <dt>拘束ソルバ(planegcs)の起動</dt>
          <dd>{ms(initReport?.gcsInitMs)}</dd>
          {initReport?.wasm.map((w) => (
            <div key={w.name} className="dl-row">
              <dt>{w.name}</dt>
              <dd>
                通信 {w.transferKB.toLocaleString()} KB / 展開後 {w.decodedKB.toLocaleString()} KB / {w.downloadMs} ms
              </dd>
            </div>
          ))}
          <dt>前回の計算(拘束 / 立体 / 表示用データ)</dt>
          <dd data-testid="last-timings">
            {last ? `${ms(last.solveMs)} / ${ms(last.buildMs)} / ${ms(last.meshMs)}(三角形 ${last.triangles} 個)` : "—"}
          </dd>
          <dt>連続テスト(20回)</dt>
          <dd data-testid="stress">
            {stress
              ? `平均 ${ms(stress.avgTotalMs)}、最大 ${ms(stress.maxTotalMs)}、失敗 ${stress.failures} 回`
              : "まだ実行していません"}
          </dd>
          <dt>JSメモリ使用量</dt>
          <dd>{report.jsHeapMB == null ? "この端末では取得できません" : `${report.jsHeapMB} MB`}</dd>
        </dl>
        <div className="actions">
          <button type="button" data-testid="run-stress" disabled={phase !== "ready" || busy} onClick={runStress}>
            連続テストを実行
          </button>
          <button type="button" onClick={copyReport} disabled={phase !== "ready"}>
            {copied ? "コピーしました" : "計測結果をコピー"}
          </button>
        </div>
        <textarea id="report-text" readOnly value={JSON.stringify(report, null, 2)} rows={6} />
      </details>
    </div>
  );
}
