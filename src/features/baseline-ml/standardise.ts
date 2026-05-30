/**
 * Phase 8 — feature standardisation.
 *
 * Logistic regression with L2 regularisation needs features on a comparable
 * scale or the regulariser will systematically prefer features with large
 * variance. We standardise to mean 0, std 1 at train time and re-apply the
 * same shift/scale at inference. The transform parameters are stored in
 * the model payload so prediction is deterministic and reproducible
 * without re-reading the training set.
 */

export interface Standardiser {
  mean: number[];
  std: number[];
}

/** Compute column-wise mean + std from a training matrix. */
export function fitStandardiser(
  X: ReadonlyArray<ReadonlyArray<number>>,
): Standardiser {
  if (X.length === 0) return { mean: [], std: [] };
  const p = X[0]!.length;
  const n = X.length;
  const mean = new Array<number>(p).fill(0);
  for (const row of X) {
    for (let j = 0; j < p; j++) mean[j] = mean[j]! + row[j]!;
  }
  for (let j = 0; j < p; j++) mean[j] = mean[j]! / n;

  const std = new Array<number>(p).fill(0);
  for (const row of X) {
    for (let j = 0; j < p; j++) {
      const d = row[j]! - mean[j]!;
      std[j] = std[j]! + d * d;
    }
  }
  for (let j = 0; j < p; j++) {
    const v = std[j]! / Math.max(1, n - 1);
    // Guard against zero-variance columns (e.g. a constant feature):
    // a tiny epsilon keeps the inverse stable without inflating the column.
    std[j] = Math.sqrt(v) || 1;
  }
  return { mean, std };
}

/** Apply a fitted standardiser to one row. */
export function standardiseRow(
  s: Standardiser,
  row: ReadonlyArray<number>,
): number[] {
  if (row.length !== s.mean.length) {
    throw new Error(
      `standardiseRow: length mismatch row=${row.length} std=${s.mean.length}`,
    );
  }
  const out = new Array<number>(row.length);
  for (let j = 0; j < row.length; j++) {
    out[j] = (row[j]! - s.mean[j]!) / s.std[j]!;
  }
  return out;
}

/** Apply a fitted standardiser to a matrix. */
export function standardiseMatrix(
  s: Standardiser,
  X: ReadonlyArray<ReadonlyArray<number>>,
): number[][] {
  return X.map((row) => standardiseRow(s, row));
}
