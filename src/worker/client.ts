import * as Comlink from "comlink";
import type { CadWorkerApi } from "./cad.worker";

export type CadClient = Comlink.Remote<CadWorkerApi>;

export function createCadWorker(): { cad: CadClient; terminate: () => void } {
  const worker = new Worker(new URL("./cad.worker.ts", import.meta.url), { type: "module" });
  return { cad: Comlink.wrap<CadWorkerApi>(worker), terminate: () => worker.terminate() };
}
