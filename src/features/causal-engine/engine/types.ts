/**
 * Phase 7 — stable causal engine interface.
 *
 * Both the in-process TypeScript baseline (`backdoor_ols`) and the optional
 * Python worker (`dowhy`, `causal-learn`) implement {@link CausalEngine}.
 * The rest of the app (orchestrators, CLI, server actions, UI) only talks
 * to this interface — swapping engines never reaches downstream code.
 *
 * Design rules:
 *   1. Method names are stable strings; engines may add new methods over time.
 *   2. Every result carries enough provenance (method, engine, warnings) to
 *      be persisted to `CausalEstimate` without losing context.
 *   3. `available()` may be slow on first call (e.g. spawning a Python
 *      subprocess) and must never throw — return `false` on any failure.
 */

import type { CausalNode } from "../dag";
import type { FeatureRow } from "../feature-table";

export type EngineName = "baseline" | "advanced";

export interface EngineEstimateRequest {
  treatment: CausalNode;
  outcome: CausalNode;
  /** Pre-computed backdoor adjustment set. */
  adjustmentSet: CausalNode[];
  rows: ReadonlyArray<FeatureRow>;
  bootstrapIters?: number;
  ciLevel?: number;
  seed?: number;
}

export interface EngineEstimateResult {
  treatment: CausalNode;
  outcome: CausalNode;
  adjustmentSet: CausalNode[];
  estimate: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  sampleSize: number;
  /** Free-form engine method label, e.g. `backdoor_ols` or `dowhy_linear_regression`. */
  method: string;
  engine: EngineName;
  bootstrapIters: number;
  notes: string[];
  warnings: string[];
}

export interface EngineDiscoverRequest {
  rows: ReadonlyArray<FeatureRow>;
  nodes: ReadonlyArray<CausalNode>;
  alpha?: number;
  seed?: number;
}

export interface DiscoveredEdge {
  from: CausalNode;
  to: CausalNode;
  /** True if the algorithm could orient the edge; false if direction is undetermined. */
  oriented: boolean;
}

export interface EngineDiscoverResult {
  algorithm: string;
  alpha: number;
  edges: DiscoveredEdge[];
  /** Independence-test count, kept for transparency. */
  independenceTests: number;
  warnings: string[];
  engine: EngineName;
}

export interface CausalEngine {
  readonly name: EngineName;
  available(): Promise<boolean>;
  estimate(req: EngineEstimateRequest): Promise<EngineEstimateResult>;
  /** Optional capability — `undefined` if the engine cannot run discovery. */
  discover?(req: EngineDiscoverRequest): Promise<EngineDiscoverResult>;
}
