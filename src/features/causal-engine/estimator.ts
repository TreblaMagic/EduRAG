/**
 * Backdoor-adjusted OLS effect estimation for the EduRAG MVP.
 *
 * For each (treatment T, outcome Y, adjustment set Z) the estimator fits
 *
 *     Y = β_0 + β_T · T + Σ β_z · z + ε
 *
 * and returns β_T as the estimated effect, together with a percentile
 * bootstrap confidence interval and provenance metadata.
 *
 * **Not** a causal-proof engine. The estimates inherit any misspecification
 * in the DAG (see `dag.ts`) and the linear functional form. The output is
 * labelled "model-based estimate" everywhere it surfaces.
 */

import { adjustmentSetFor, type CausalNode } from "./dag";
import type { FeatureRow } from "./feature-table";
import { ols, type Matrix, type Vector } from "./linear-algebra";
import { mulberry32 } from "./rng";

export interface EffectEstimate {
  treatment: CausalNode;
  outcome: CausalNode;
  adjustmentSet: CausalNode[];
  estimate: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  sampleSize: number;
  method: string;
  bootstrapIters: number;
  limitations: string[];
}

export interface EstimatorOptions {
  bootstrapIters?: number;
  ciLevel?: number;
  seed?: number;
}

const DEFAULTS = {
  bootstrapIters: 500,
  ciLevel: 0.95,
  seed: 42,
} as const;

/** Fit β_T on the given rows; returns only the point estimate (no CI). */
export function estimateEffectPoint(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
): { estimate: number; adjustmentSet: CausalNode[]; sampleSize: number } {
  const adjustment = adjustmentSetFor(treatment);
  const betaT = fitBetaT(rows, treatment, outcome, adjustment);
  return { estimate: betaT, adjustmentSet: adjustment, sampleSize: rows.length };
}

/** Full estimate: point + bootstrap CI + provenance. */
export function estimateEffect(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  options: EstimatorOptions = {},
): EffectEstimate {
  const opts = { ...DEFAULTS, ...options };
  const adjustment = adjustmentSetFor(treatment);

  if (rows.length < adjustment.length + 2) {
    throw new Error(
      `estimateEffect: sample too small (n=${rows.length}, needs > ${adjustment.length + 1})`,
    );
  }

  const betaT = fitBetaT(rows, treatment, outcome, adjustment);
  const [ciLow, ciHigh] = bootstrapCi(rows, treatment, outcome, adjustment, opts);

  return {
    treatment,
    outcome,
    adjustmentSet: adjustment,
    estimate: round4(betaT),
    ciLow: round4(ciLow),
    ciHigh: round4(ciHigh),
    ciLevel: opts.ciLevel,
    sampleSize: rows.length,
    method: "backdoor_ols",
    bootstrapIters: opts.bootstrapIters,
    limitations: standardLimitations(),
  };
}

// ---- internals -------------------------------------------------------------

function fitBetaT(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  adjustment: ReadonlyArray<CausalNode>,
): number {
  const { X, y } = buildDesignMatrix(rows, treatment, outcome, adjustment);
  const beta = ols(X, y);
  // beta[0] = intercept, beta[1] = β_T.
  return beta[1] ?? Number.NaN;
}

function buildDesignMatrix(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  adjustment: ReadonlyArray<CausalNode>,
): { X: Matrix; y: Vector } {
  const X: Matrix = new Array(rows.length);
  const y: Vector = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i]!.features;
    const row = new Array<number>(2 + adjustment.length);
    row[0] = 1; // intercept
    row[1] = f[treatment];
    for (let k = 0; k < adjustment.length; k++) {
      row[2 + k] = f[adjustment[k]!];
    }
    X[i] = row;
    y[i] = f[outcome];
  }
  return { X, y };
}

function bootstrapCi(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  adjustment: ReadonlyArray<CausalNode>,
  opts: { bootstrapIters: number; ciLevel: number; seed: number },
): [number, number] {
  const rng = mulberry32(opts.seed);
  const n = rows.length;
  const estimates: number[] = [];

  for (let b = 0; b < opts.bootstrapIters; b++) {
    const sample: FeatureRow[] = new Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = rows[Math.floor(rng() * n)]!;
    }
    try {
      estimates.push(fitBetaT(sample, treatment, outcome, adjustment));
    } catch {
      // Singular design — skip this iteration. Happens when a bootstrap
      // sample lacks treatment variance, which is rare at our sample sizes.
    }
  }

  if (estimates.length === 0) return [Number.NaN, Number.NaN];

  estimates.sort((a, b) => a - b);
  const alpha = (1 - opts.ciLevel) / 2;
  return [percentile(estimates, alpha), percentile(estimates, 1 - alpha)];
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(p * sorted.length)),
  );
  return sorted[idx]!;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function standardLimitations(): string[] {
  return [
    "Estimates are model-based, not causal proof.",
    "The DAG is hypothesised by the project author, not learned from data.",
    "Linear functional form; non-linear and interaction effects are not captured.",
    "Synthetic data is generated to match the DAG, so estimates are by construction faithful on this dataset — real-world generalisation is not claimed.",
  ];
}
