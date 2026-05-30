/**
 * Phase 7 — engine factory + helpers.
 *
 * `selectEngine` resolves a requested engine name to a usable engine
 * instance, with automatic fallback when the advanced (Python) worker is
 * not present. The fallback path is observable — `resolvedName` records
 * what was actually used, and `warnings` carries the reason for the
 * downgrade. UI and CLI surface this to the user instead of silently
 * swapping engines.
 *
 * **Bundle-safety note.** The advanced engine touches Node-only modules
 * (`node:fs`, `node:path`, `node:child_process`). We deliberately import
 * it via `await import()` so client components that pull from the public
 * barrel never pay for the Node-only graph. Server code that needs direct
 * access can `import { advancedEngine } from "@/features/causal-engine/engine/advanced-engine"`.
 */

import { baselineEngine } from "./baseline-engine";
import type { CausalEngine, EngineName } from "./types";

export interface SelectedEngine {
  engine: CausalEngine;
  requestedName: EngineName;
  resolvedName: EngineName;
  warnings: string[];
}

export async function selectEngine(name: EngineName): Promise<SelectedEngine> {
  if (name === "baseline") {
    return {
      engine: baselineEngine,
      requestedName: "baseline",
      resolvedName: "baseline",
      warnings: [],
    };
  }
  try {
    const mod = await import("./advanced-engine");
    const available = await mod.advancedEngine.available();
    if (available) {
      return {
        engine: mod.advancedEngine,
        requestedName: "advanced",
        resolvedName: "advanced",
        warnings: [],
      };
    }
  } catch {
    // Fall through to the baseline path.
  }
  return {
    engine: baselineEngine,
    requestedName: "advanced",
    resolvedName: "baseline",
    warnings: [
      "Advanced (Python) engine unavailable; fell back to the TypeScript baseline. Install the optional Python worker to enable DoWhy + causal-learn.",
    ],
  };
}

export { baselineEngine };
export type {
  CausalEngine,
  EngineDiscoverRequest,
  EngineDiscoverResult,
  EngineEstimateRequest,
  EngineEstimateResult,
  EngineName,
  DiscoveredEdge,
} from "./types";
