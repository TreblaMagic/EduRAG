/**
 * Phase 7 — extended refutation checks.
 *
 * Layered on top of the Phase 3 placebo + random-common-cause baseline.
 * Every new check returns a structured payload that the dashboard renders
 * directly — failed refutations are surfaced as warnings, never silently
 * suppressed.
 *
 * Checks implemented:
 *   - **Subset robustness.** Re-fit β on K random sub-samples (default
 *     `sampleFraction = 0.7`). Report the coefficient of variation; flag
 *     unstable estimates (`cv > threshold`).
 *   - **Bootstrap stability.** Fraction of bootstrap β with the *same sign*
 *     as the point estimate. High stability → directionally robust.
 *   - **Sensitivity to adjustment set.** Drop each adjuster in turn (one
 *     leave-one-out re-fit) and report the maximum relative change in β.
 *     Captures "how much does the answer depend on what we control for?".
 *   - **Outcome permutation (placebo-on-outcome).** Shuffle the outcome
 *     vector — β should collapse toward zero. Complementary to the
 *     existing placebo-on-treatment.
 */

import { adjustmentSetFor, BASELINE_ADJUSTERS, type CausalNode } from "./dag";
import { estimateEffectPoint } from "./estimator";
import type { FeatureRow } from "./feature-table";
import { ols } from "./linear-algebra";
import { mulberry32, type Rng } from "./rng";

export interface SubsetRobustnessResult {
  description: string;
  iterations: number;
  sampleFraction: number;
  meanEstimate: number;
  stdEstimate: number;
  coefficientOfVariation: number;
  threshold: number;
  passes: boolean;
}

export interface BootstrapStabilityResult {
  description: string;
  iterations: number;
  sameSignFraction: number;
  threshold: number;
  passes: boolean;
}

export interface SensitivityResult {
  description: string;
  perAdjuster: Array<{
    droppedAdjuster: CausalNode;
    adjustedEstimate: number;
    relativeChange: number;
  }>;
  maxRelativeChange: number;
  threshold: number;
  passes: boolean;
}

export interface OutcomePermutationResult {
  description: string;
  originalEstimate: number;
  permutedEstimate: number;
  ratio: number;
  threshold: number;
  passes: boolean;
}

export interface ExtendedRefutationResult {
  subsetRobustness: SubsetRobustnessResult;
  bootstrapStability: BootstrapStabilityResult;
  sensitivity: SensitivityResult;
  outcomePermutation: OutcomePermutationResult;
}

export interface ExtendedRefutationOptions {
  seed?: number;
  subsetIterations?: number;
  sampleFraction?: number;
  subsetCvThreshold?: number;
  bootstrapIterations?: number;
  bootstrapSameSignThreshold?: number;
  sensitivityRelativeChangeThreshold?: number;
  outcomePermutationThreshold?: number;
}

interface ResolvedOptions {
  seed: number;
  subsetIterations: number;
  sampleFraction: number;
  subsetCvThreshold: number;
  bootstrapIterations: number;
  bootstrapSameSignThreshold: number;
  sensitivityRelativeChangeThreshold: number;
  outcomePermutationThreshold: number;
}

const DEFAULTS: ResolvedOptions = {
  seed: 11,
  subsetIterations: 50,
  sampleFraction: 0.7,
  subsetCvThreshold: 0.5,
  bootstrapIterations: 200,
  bootstrapSameSignThreshold: 0.8,
  sensitivityRelativeChangeThreshold: 0.4,
  outcomePermutationThreshold: 0.3,
};

export function runExtendedRefutations(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  options: ExtendedRefutationOptions = {},
): ExtendedRefutationResult {
  const opts = { ...DEFAULTS, ...options };
  return {
    subsetRobustness: subsetRobustness(rows, treatment, outcome, opts),
    bootstrapStability: bootstrapStability(
      rows,
      treatment,
      outcome,
      originalEstimate,
      opts,
    ),
    sensitivity: sensitivityToAdjustmentSet(
      rows,
      treatment,
      outcome,
      originalEstimate,
      opts,
    ),
    outcomePermutation: outcomePermutation(
      rows,
      treatment,
      outcome,
      originalEstimate,
      opts,
    ),
  };
}

function subsetRobustness(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  opts: typeof DEFAULTS,
): SubsetRobustnessResult {
  const rng = mulberry32(opts.seed);
  const n = rows.length;
  const subsetSize = Math.max(
    adjustmentSetFor(treatment).length + 3,
    Math.floor(n * opts.sampleFraction),
  );
  const estimates: number[] = [];
  for (let i = 0; i < opts.subsetIterations; i++) {
    const sample = sampleWithoutReplacement(rows, subsetSize, rng);
    try {
      const { estimate } = estimateEffectPoint(sample, treatment, outcome);
      if (Number.isFinite(estimate)) estimates.push(estimate);
    } catch {
      // Skip singular subsets.
    }
  }
  const mean = average(estimates);
  const std = stdev(estimates, mean);
  const cv = Math.abs(mean) < 1e-9 ? Number.POSITIVE_INFINITY : std / Math.abs(mean);
  return {
    description:
      "Re-fit β on random sub-samples; the coefficient of variation captures how stable the estimate is to which rows we observe.",
    iterations: opts.subsetIterations,
    sampleFraction: opts.sampleFraction,
    meanEstimate: round4(mean),
    stdEstimate: round4(std),
    coefficientOfVariation: round4(cv),
    threshold: opts.subsetCvThreshold,
    passes: cv < opts.subsetCvThreshold,
  };
}

function bootstrapStability(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  opts: typeof DEFAULTS,
): BootstrapStabilityResult {
  const rng = mulberry32(opts.seed + 2);
  const n = rows.length;
  const sign = Math.sign(originalEstimate);
  let sameSign = 0;
  let counted = 0;
  for (let b = 0; b < opts.bootstrapIterations; b++) {
    const sample: FeatureRow[] = new Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = rows[Math.floor(rng() * n)]!;
    }
    try {
      const { estimate } = estimateEffectPoint(sample, treatment, outcome);
      if (!Number.isFinite(estimate)) continue;
      counted++;
      if (Math.sign(estimate) === sign) sameSign++;
    } catch {
      // skip
    }
  }
  const fraction = counted === 0 ? 0 : sameSign / counted;
  return {
    description:
      "Fraction of bootstrap β with the same sign as the point estimate. High values mean the direction of the effect is robust.",
    iterations: counted,
    sameSignFraction: round4(fraction),
    threshold: opts.bootstrapSameSignThreshold,
    passes: fraction >= opts.bootstrapSameSignThreshold,
  };
}

function sensitivityToAdjustmentSet(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  opts: typeof DEFAULTS,
): SensitivityResult {
  const baseAdjustment = adjustmentSetFor(treatment);
  if (baseAdjustment.length === 0) {
    return {
      description:
        "Leave-one-out over the adjustment set; baseline adjustment is empty so the check is trivially satisfied.",
      perAdjuster: [],
      maxRelativeChange: 0,
      threshold: opts.sensitivityRelativeChangeThreshold,
      passes: true,
    };
  }
  const denom = Math.max(Math.abs(originalEstimate), 1e-9);
  const perAdjuster: SensitivityResult["perAdjuster"] = [];
  let maxRel = 0;
  for (const drop of baseAdjustment) {
    const adjusted = baseAdjustment.filter((a) => a !== drop);
    const fitted = fitBetaWith(rows, treatment, outcome, adjusted);
    const rel = Math.abs(fitted - originalEstimate) / denom;
    if (rel > maxRel) maxRel = rel;
    perAdjuster.push({
      droppedAdjuster: drop,
      adjustedEstimate: round4(fitted),
      relativeChange: round4(rel),
    });
  }
  return {
    description:
      "Leave-one-out over the adjustment set. Large relative changes mean the result depends heavily on which confounders we control for.",
    perAdjuster,
    maxRelativeChange: round4(maxRel),
    threshold: opts.sensitivityRelativeChangeThreshold,
    passes: maxRel < opts.sensitivityRelativeChangeThreshold,
  };
}

function outcomePermutation(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  opts: typeof DEFAULTS,
): OutcomePermutationResult {
  const rng = mulberry32(opts.seed + 3);
  const values = rows.map((r) => r.features[outcome]);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = values[i]!;
    values[i] = values[j]!;
    values[j] = tmp;
  }
  const permuted: FeatureRow[] = rows.map((r, i) => ({
    ...r,
    features: { ...r.features, [outcome]: values[i]! },
  }));
  const { estimate: permutedEstimate } = estimateEffectPoint(
    permuted,
    treatment,
    outcome,
  );
  const denom = Math.max(Math.abs(originalEstimate), 1e-9);
  const ratio = Math.abs(permutedEstimate) / denom;
  return {
    description:
      "Shuffle the outcome column; the estimated effect should collapse toward zero. Complements the treatment-shuffle placebo.",
    originalEstimate: round4(originalEstimate),
    permutedEstimate: round4(permutedEstimate),
    ratio: round4(ratio),
    threshold: opts.outcomePermutationThreshold,
    passes: ratio < opts.outcomePermutationThreshold,
  };
}

// ---- shared helpers --------------------------------------------------------

function fitBetaWith(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  adjustment: ReadonlyArray<CausalNode>,
): number {
  const X: number[][] = new Array(rows.length);
  const y: number[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i]!.features;
    const row = new Array<number>(2 + adjustment.length);
    row[0] = 1;
    row[1] = f[treatment];
    for (let k = 0; k < adjustment.length; k++) {
      row[2 + k] = f[adjustment[k]!];
    }
    X[i] = row;
    y[i] = f[outcome];
  }
  try {
    return ols(X, y)[1] ?? Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function sampleWithoutReplacement<T>(
  arr: ReadonlyArray<T>,
  k: number,
  rng: Rng,
): T[] {
  const k_ = Math.min(k, arr.length);
  const indices = arr.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return indices.slice(0, k_).map((i) => arr[i]!);
}

function average(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: ReadonlyArray<number>, mean: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) * (x - mean);
  return Math.sqrt(s / (xs.length - 1));
}

function round4(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 10000) / 10000;
}

/** Default adjuster catalogue export — useful for UI introspection. */
export const ADJUSTERS = BASELINE_ADJUSTERS;
