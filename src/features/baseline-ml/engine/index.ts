/**
 * Phase 8 + 9 — prediction engine factory.
 *
 * Mirrors the Phase 7 `selectEngine` shape exactly so the orchestrator and
 * the rest of the app can stay engine-agnostic. The advanced engine
 * (Python worker, optional) lives behind a **dynamic import** for the same
 * webpack-safety reason — client components that pull from the public
 * barrel never load Node-only modules.
 *
 * Phase 9 wires the advanced engine to sklearn through
 * `python/causal-worker/worker.py` (commands `predict_train` +
 * `predict_infer`). When Python isn't installed, or sklearn isn't
 * present, or the worker errors out, we fall back to the baseline with a
 * structured warning. The dashboard surfaces the warning so the user
 * always knows which engine ran.
 */

import { baselinePredictionEngine } from "./baseline-prediction-engine";
import type { PredictionEngine, PredictionEngineName } from "../types";

export interface SelectedPredictionEngine {
  engine: PredictionEngine;
  requestedName: PredictionEngineName;
  resolvedName: PredictionEngineName;
  warnings: string[];
}

export async function selectPredictionEngine(
  name: PredictionEngineName,
): Promise<SelectedPredictionEngine> {
  if (name === "baseline") {
    return {
      engine: baselinePredictionEngine,
      requestedName: "baseline",
      resolvedName: "baseline",
      warnings: [],
    };
  }
  try {
    const mod = await import("./advanced-prediction-engine");
    const available = await mod.advancedPredictionEngine.available();
    if (available) {
      return {
        engine: mod.advancedPredictionEngine,
        requestedName: "advanced",
        resolvedName: "advanced",
        warnings: [],
      };
    }
  } catch {
    // Fall through to the baseline path.
  }
  return {
    engine: baselinePredictionEngine,
    requestedName: "advanced",
    resolvedName: "baseline",
    warnings: [
      "Advanced (Python) prediction engine unavailable; fell back to the TypeScript logistic baseline. " +
        "Install the optional Python worker (numpy + scikit-learn) to enable it — see python/causal-worker/README.md.",
    ],
  };
}

export { baselinePredictionEngine };
