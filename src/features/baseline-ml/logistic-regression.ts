/**
 * Phase 8 — pure-TS logistic regression with L2 regularisation.
 *
 * Designed for the EduRAG baseline-prediction layer: small designs (≤ 10
 * features, ≤ 10k rows), no external dependencies, deterministic given
 * a seed. **Not** a production ML library — for anything larger or more
 * exotic (calibration, MAP priors, non-linear features) reach for
 * scikit-learn via the optional Python worker.
 *
 * Model:
 *
 *     P(y = 1 | x) = σ(x' β),   σ(z) = 1 / (1 + e^{-z})
 *     L(β)        = −Σ [y log p + (1 − y) log(1 − p)] + (λ / 2) Σ β_j²
 *                                                              j ≠ 0   (intercept un-regularised)
 *
 * Optimiser: vanilla batch gradient descent with a learning rate; we keep
 * the implementation trivially auditable rather than chasing the last few
 * iterations of convergence speed. The caller is responsible for
 * standardising X before training.
 */

export interface LogisticTrainOptions {
  iterations?: number;
  learningRate?: number;
  l2?: number;
  /** Stops early if `‖β − β_prev‖∞ < tolerance`. */
  tolerance?: number;
}

export interface LogisticModel {
  coefficients: number[];
  intercept: number;
  iterations: number;
  converged: boolean;
  finalLoss: number;
}

const DEFAULTS: Required<LogisticTrainOptions> = {
  iterations: 400,
  learningRate: 0.1,
  l2: 0.01,
  tolerance: 1e-6,
};

/**
 * Fit a binary logistic-regression model. `X` rows are feature vectors
 * *without* an intercept term — one is prepended internally. `y` entries
 * must be 0 or 1.
 */
export function trainLogistic(
  X: ReadonlyArray<ReadonlyArray<number>>,
  y: ReadonlyArray<number>,
  options: LogisticTrainOptions = {},
): LogisticModel {
  if (X.length !== y.length) {
    throw new Error(`trainLogistic: row mismatch X=${X.length} y=${y.length}`);
  }
  if (X.length === 0) throw new Error("trainLogistic: empty design");
  const opts = { ...DEFAULTS, ...options };
  const n = X.length;
  const p = X[0]!.length;

  let intercept = 0;
  const beta = new Array<number>(p).fill(0);
  let iter = 0;
  let converged = false;
  let loss = Number.POSITIVE_INFINITY;

  for (; iter < opts.iterations; iter++) {
    const pred = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      pred[i] = sigmoid(linearScore(X[i]!, beta, intercept));
    }

    // Gradients: g_j = (1/n) Σ (p_i − y_i) · x_ij + λ β_j ;  g_0 (intercept) un-regularised
    let gIntercept = 0;
    const gBeta = new Array<number>(p).fill(0);
    for (let i = 0; i < n; i++) {
      const diff = pred[i]! - y[i]!;
      gIntercept += diff;
      const row = X[i]!;
      for (let j = 0; j < p; j++) gBeta[j] = gBeta[j]! + diff * row[j]!;
    }
    gIntercept /= n;
    for (let j = 0; j < p; j++) {
      gBeta[j] = gBeta[j]! / n + opts.l2 * beta[j]!;
    }

    intercept -= opts.learningRate * gIntercept;
    let maxStep = Math.abs(opts.learningRate * gIntercept);
    for (let j = 0; j < p; j++) {
      const step = opts.learningRate * gBeta[j]!;
      beta[j] = beta[j]! - step;
      const a = Math.abs(step);
      if (a > maxStep) maxStep = a;
    }

    // Log-loss with regularisation term.
    loss = 0;
    for (let i = 0; i < n; i++) {
      const pi = clampProb(pred[i]!);
      loss -= y[i]! * Math.log(pi) + (1 - y[i]!) * Math.log(1 - pi);
    }
    loss /= n;
    let reg = 0;
    for (let j = 0; j < p; j++) reg += beta[j]! * beta[j]!;
    loss += (opts.l2 / 2) * reg;

    if (maxStep < opts.tolerance) {
      converged = true;
      iter++;
      break;
    }
  }

  return {
    coefficients: beta,
    intercept,
    iterations: iter,
    converged,
    finalLoss: loss,
  };
}

/** Predict probability `P(y = 1 | x)` for a single feature vector. */
export function predictProbability(model: LogisticModel, x: ReadonlyArray<number>): number {
  if (x.length !== model.coefficients.length) {
    throw new Error(
      `predictProbability: feature length mismatch x=${x.length} β=${model.coefficients.length}`,
    );
  }
  return sigmoid(linearScore(x, model.coefficients, model.intercept));
}

/** Predict the binary class given a probability threshold. */
export function predictClass(prob: number, threshold = 0.5): 0 | 1 {
  return prob >= threshold ? 1 : 0;
}

// ---- internals -------------------------------------------------------------

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function linearScore(
  x: ReadonlyArray<number>,
  beta: ReadonlyArray<number>,
  intercept: number,
): number {
  let z = intercept;
  for (let j = 0; j < x.length; j++) z += x[j]! * beta[j]!;
  return z;
}

function clampProb(p: number): number {
  if (p < 1e-15) return 1e-15;
  if (p > 1 - 1e-15) return 1 - 1e-15;
  return p;
}
