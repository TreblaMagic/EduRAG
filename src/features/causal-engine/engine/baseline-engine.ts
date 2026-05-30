/**
 * Phase 7 — TypeScript baseline engine.
 *
 * Wraps the existing in-process estimator (`estimateEffect`) behind the
 * stable {@link CausalEngine} contract. This is the default engine and is
 * always available — no external runtime, no extra dependencies.
 *
 * The baseline engine deliberately does not implement {@link CausalEngine.discover};
 * discovery has its own pure module (`../discovery.ts`) the advanced engine
 * can replace with a heavier algorithm.
 */

import { estimateEffect } from "../estimator";
import { runDiscovery } from "../discovery";
import type {
  CausalEngine,
  EngineDiscoverRequest,
  EngineDiscoverResult,
  EngineEstimateRequest,
  EngineEstimateResult,
} from "./types";

export const BASELINE_METHOD = "backdoor_ols";

class BaselineEngine implements CausalEngine {
  readonly name = "baseline" as const;

  async available(): Promise<boolean> {
    return true;
  }

  async estimate(req: EngineEstimateRequest): Promise<EngineEstimateResult> {
    const estimatorOptions: Parameters<typeof estimateEffect>[3] = {};
    if (req.bootstrapIters !== undefined) estimatorOptions.bootstrapIters = req.bootstrapIters;
    if (req.ciLevel !== undefined) estimatorOptions.ciLevel = req.ciLevel;
    if (req.seed !== undefined) estimatorOptions.seed = req.seed;
    const out = estimateEffect(req.rows, req.treatment, req.outcome, estimatorOptions);

    return {
      treatment: out.treatment,
      outcome: out.outcome,
      adjustmentSet: out.adjustmentSet,
      estimate: out.estimate,
      ciLow: out.ciLow,
      ciHigh: out.ciHigh,
      ciLevel: out.ciLevel,
      sampleSize: out.sampleSize,
      method: BASELINE_METHOD,
      engine: "baseline",
      bootstrapIters: out.bootstrapIters,
      notes: out.limitations,
      warnings: [],
    };
  }

  async discover(req: EngineDiscoverRequest): Promise<EngineDiscoverResult> {
    const discoveryOptions: Parameters<typeof runDiscovery>[1] = {};
    if (req.nodes !== undefined) discoveryOptions.nodes = req.nodes;
    if (req.alpha !== undefined) discoveryOptions.alpha = req.alpha;
    if (req.seed !== undefined) discoveryOptions.seed = req.seed;
    const out = runDiscovery(req.rows, discoveryOptions);
    return {
      algorithm: out.algorithm,
      alpha: out.alpha,
      edges: out.edges,
      independenceTests: out.independenceTests,
      warnings: out.warnings,
      engine: "baseline",
    };
  }
}

export const baselineEngine: CausalEngine = new BaselineEngine();
