/**
 * Lightweight refutation checks.
 *
 * These don't *prove* an estimate is causal — they help us catch the case
 * where the model would happily "find" an effect that shouldn't be there.
 * Each refutation produces a structured result with `passes: boolean` so
 * the UI / log can flag suspicious estimates.
 *
 * Implemented:
 *   1. **Placebo / shuffled-treatment test** — shuffle the treatment column
 *      across rows and re-fit. The estimated effect should drop toward
 *      zero. Configurable threshold (ratio of |placebo β| to |original β|).
 *   2. **Random common cause test** — add a uniform random covariate to
 *      the adjustment set and re-fit. The estimate should be stable.
 *      Configurable threshold (relative change in β).
 */

import { adjustmentSetFor, type CausalNode } from "./dag";
import { estimateEffectPoint } from "./estimator";
import type { FeatureRow } from "./feature-table";
import { ols } from "./linear-algebra";
import { mulberry32, type Rng } from "./rng";

export interface PlaceboResult {
  description: string;
  originalEstimate: number;
  placeboEstimate: number;
  ratio: number;
  threshold: number;
  passes: boolean;
}

export interface RandomCommonCauseResult {
  description: string;
  originalEstimate: number;
  adjustedEstimate: number;
  absChange: number;
  relativeChange: number;
  threshold: number;
  passes: boolean;
}

export interface RefutationResult {
  placebo: PlaceboResult;
  randomCommonCause: RandomCommonCauseResult;
}

export interface RefutationOptions {
  seed?: number;
  placeboThreshold?: number;
  randomCommonCauseThreshold?: number;
}

const DEFAULTS = {
  seed: 7,
  /** Placebo: |β_placebo| should be < this fraction of |β_original|. */
  placeboThreshold: 0.30,
  /** Random common cause: relative change in β should be < this. */
  randomCommonCauseThreshold: 0.25,
} as const;

export function runRefutations(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  options: RefutationOptions = {},
): RefutationResult {
  const opts = { ...DEFAULTS, ...options };
  return {
    placebo: placeboTest(rows, treatment, outcome, originalEstimate, opts),
    randomCommonCause: randomCommonCauseTest(
      rows,
      treatment,
      outcome,
      originalEstimate,
      opts,
    ),
  };
}

function placeboTest(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  opts: { seed: number; placeboThreshold: number },
): PlaceboResult {
  const rng = mulberry32(opts.seed);
  const shuffled = shuffleColumn(rows, treatment, rng);
  const { estimate: placeboEstimate } = estimateEffectPoint(
    shuffled,
    treatment,
    outcome,
  );

  const denominator = Math.max(Math.abs(originalEstimate), 1e-9);
  const ratio = Math.abs(placeboEstimate) / denominator;

  return {
    description:
      "Shuffle the treatment column across rows; the estimated effect should approach zero.",
    originalEstimate: round4(originalEstimate),
    placeboEstimate: round4(placeboEstimate),
    ratio: round4(ratio),
    threshold: opts.placeboThreshold,
    passes: ratio < opts.placeboThreshold,
  };
}

function randomCommonCauseTest(
  rows: ReadonlyArray<FeatureRow>,
  treatment: CausalNode,
  outcome: CausalNode,
  originalEstimate: number,
  opts: { seed: number; randomCommonCauseThreshold: number },
): RandomCommonCauseResult {
  const rng = mulberry32(opts.seed + 1);
  const adjustment = adjustmentSetFor(treatment);

  const X: number[][] = new Array(rows.length);
  const y: number[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i]!.features;
    const row = new Array<number>(3 + adjustment.length);
    row[0] = 1;
    row[1] = f[treatment];
    for (let k = 0; k < adjustment.length; k++) {
      row[2 + k] = f[adjustment[k]!];
    }
    row[2 + adjustment.length] = rng() * 2 - 1; // U(-1, 1) random covariate
    X[i] = row;
    y[i] = f[outcome];
  }

  const beta = ols(X, y);
  const adjustedEstimate = beta[1] ?? Number.NaN;
  const absChange = Math.abs(adjustedEstimate - originalEstimate);
  const relativeChange = absChange / Math.max(Math.abs(originalEstimate), 1e-9);

  return {
    description:
      "Add a uniform random covariate to the adjustment set; the estimate should not change materially.",
    originalEstimate: round4(originalEstimate),
    adjustedEstimate: round4(adjustedEstimate),
    absChange: round4(absChange),
    relativeChange: round4(relativeChange),
    threshold: opts.randomCommonCauseThreshold,
    passes: relativeChange < opts.randomCommonCauseThreshold,
  };
}

function shuffleColumn(
  rows: ReadonlyArray<FeatureRow>,
  column: CausalNode,
  rng: Rng,
): FeatureRow[] {
  const values = rows.map((r) => r.features[column]);
  // Fisher-Yates.
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = values[i]!;
    values[i] = values[j]!;
    values[j] = tmp;
  }
  return rows.map((r, i) => ({
    ...r,
    features: { ...r.features, [column]: values[i]! },
  }));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
