import * as Comlink from "comlink";
import type { CadWorkerApi } from "./bench.worker";

export type CadClient = Comlink.Remote<CadWorkerApi>;

export function createCadWorker(): { cad: CadClient; terminate: () => void } {
  const worker = new Worker(new URL("./bench.worker.ts", import.meta.url), { type: "module" });
  return { cad: Comlink.wrap<CadWorkerApi>(worker), terminate: () => worker.terminate() };
}
