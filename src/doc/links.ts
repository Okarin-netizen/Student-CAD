// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 作業どうしのつながり(どの作業が、どのスケッチや作業を使っているか)。

import type { CadDocument, Feature, Id } from "./types";

/** 作業 f が使っているスケッチ・作業の id */
export function featureInputs(f: Feature): Id[] {
  switch (f.type) {
    case "extrude":
    case "revolve":
      return [f.sketchId];
    case "mirror":
    case "pattern":
      return [f.source];
    case "loft":
      return f.sketchIds;
    case "sweep":
      return [f.pathId, f.profileId];
    default:
      return [];
  }
}

/** 立体を作るのにもう使ったスケッチの id(作業の id も まじるが、スケッチと比べるだけなので困らない) */
export function usedSketchIds(doc: CadDocument): Set<Id> {
  return new Set(doc.features.flatMap(featureInputs));
}

/** 消すと一緒に消える作業(スケッチを使っている押し出し、それをならべたパターンなど) */
export function dependents(doc: CadDocument, id: Id): Feature[] {
  const gone = new Set([id]);
  const out: Feature[] = [];
  for (const f of doc.features) {
    if (featureInputs(f).some((u) => gone.has(u))) {
      gone.add(f.id);
      out.push(f);
    }
  }
  return out;
}
