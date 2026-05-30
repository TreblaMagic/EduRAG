/**
 * Phase 7 — partial correlation independence tests.
 *
 * Used by the PC-skeleton discovery algorithm to decide whether two
 * variables are conditionally independent given a conditioning set Z.
 *
 * Method: linear partial correlation via OLS residualisation, then
 * Fisher's Z-transform with the standard `1 / sqrt(n - |Z| - 3)`
 * variance. Returns the two-sided p-value of the test
 *
 *     H_0:  ρ(X, Y | Z) = 0
 *
 * Assumes (multivariate) approximate normality and linear relationships,
 * which matches the modelling assumptions of the rest of the engine. We
 * explicitly do not claim normality holds in the data — discovery is
 * surfaced as an *experiment* throughout the UI.
 */

import { ols } from "./linear-algebra";

/**
 * Partial correlation coefficient between two columns after linearly
 * regressing out the columns in `conditioning`.
 */
export function partialCorrelation(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
  conditioning: ReadonlyArray<ReadonlyArray<number>>,
): number {
  if (x.length !== y.length) {
    throw new Error("partialCorrelation: x and y lengths differ");
  }
  for (const c of conditioning) {
    if (c.length !== x.length) {
      throw new Error("partialCorrelation: conditioning column length mismatch");
    }
  }
  const n = x.length;
  if (n < 3) return Number.NaN;

  if (conditioning.length === 0) {
    return pearson(x, y);
  }

  const X: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(1 + conditioning.length);
    row[0] = 1;
    for (let k = 0; k < conditioning.length; k++) {
      row[1 + k] = conditioning[k]![i]!;
    }
    X[i] = row;
  }

  const betaX = safeOls(X, [...x]);
  const betaY = safeOls(X, [...y]);
  if (!betaX || !betaY) return Number.NaN;

  const rx: number[] = new Array(n);
  const ry: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let px = 0;
    let py = 0;
    const row = X[i]!;
    for (let j = 0; j < row.length; j++) {
      px += row[j]! * betaX[j]!;
      py += row[j]! * betaY[j]!;
    }
    rx[i] = x[i]! - px;
    ry[i] = y[i]! - py;
  }
  return pearson(rx, ry);
}

/**
 * Two-sided p-value for the null `ρ = 0` under Fisher's Z transform.
 * `conditioningSize` is `|Z|` (used in the variance correction).
 */
export function fisherZPValue(
  rho: number,
  n: number,
  conditioningSize: number,
): number {
  const effectiveDf = n - conditioningSize - 3;
  if (effectiveDf <= 0) return 1.0;
  // Clamp rho away from ±1 to avoid Infinity in atanh.
  const clamped = Math.max(-0.999999, Math.min(0.999999, rho));
  const z = 0.5 * Math.log((1 + clamped) / (1 - clamped));
  const stat = Math.abs(z) * Math.sqrt(effectiveDf);
  // Two-sided normal tail.
  return 2 * (1 - standardNormalCdf(stat));
}

/** Combined helper: returns `{ rho, pValue }` for the conditional independence test. */
export function conditionalIndependenceTest(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
  conditioning: ReadonlyArray<ReadonlyArray<number>>,
): { rho: number; pValue: number } {
  const rho = partialCorrelation(x, y, conditioning);
  if (!Number.isFinite(rho)) {
    return { rho: 0, pValue: 1.0 };
  }
  return { rho, pValue: fisherZPValue(rho, x.length, conditioning.length) };
}

// ---- internals -------------------------------------------------------------

function pearson(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  const n = a.length;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const ax = a[i]! - ma;
    const by = b[i]! - mb;
    num += ax * by;
    da += ax * ax;
    db += by * by;
  }
  const denom = Math.sqrt(da * db);
  return denom < 1e-12 ? 0 : num / denom;
}

function safeOls(X: number[][], y: number[]): number[] | null {
  try {
    return ols(X, y);
  } catch {
    return null;
  }
}

/**
 * Abramowitz-Stegun 7.1.26 approximation for the standard-normal CDF.
 * Accurate to ~7.5e-8 — more than enough for an independence p-value.
 */
function standardNormalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  // Erf approximation.
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}
