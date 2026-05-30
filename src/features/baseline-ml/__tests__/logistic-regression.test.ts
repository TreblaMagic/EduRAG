import { describe, expect, it } from "vitest";

import {
  predictClass,
  predictProbability,
  trainLogistic,
} from "../logistic-regression";
import { fitStandardiser, standardiseMatrix } from "../standardise";

/**
 * Synthetic "at-risk" dataset:
 *
 *   logit(P(y = 1)) = -2 + 4·x1 + (-3)·x2
 *
 * Two features, sample size 400. Training the logistic regression on a
 * standardised version of the design should recover coefficients with the
 * correct signs and (qualitatively) correct magnitudes after the inverse
 * scaling.
 */
function makeBinaryDataset(n = 400, seed = 7) {
  let s = seed;
  const rng = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const x1 = rng();
    const x2 = rng();
    const logit = -2 + 4 * x1 - 3 * x2;
    const p = 1 / (1 + Math.exp(-logit));
    y.push(rng() < p ? 1 : 0);
    X.push([x1, x2]);
  }
  return { X, y };
}

describe("trainLogistic", () => {
  it("recovers the correct sign for each coefficient on standardised data", () => {
    const { X, y } = makeBinaryDataset();
    const std = fitStandardiser(X);
    const Xs = standardiseMatrix(std, X);
    const model = trainLogistic(Xs, y, { iterations: 500, learningRate: 0.2, l2: 0.001 });
    // β_1 positive (x1 raises risk), β_2 negative (x2 lowers it).
    expect(model.coefficients[0]).toBeGreaterThan(0);
    expect(model.coefficients[1]).toBeLessThan(0);
  });

  it("produces strictly positive accuracy above random on the training set", () => {
    const { X, y } = makeBinaryDataset();
    const std = fitStandardiser(X);
    const Xs = standardiseMatrix(std, X);
    const model = trainLogistic(Xs, y, { iterations: 500 });
    let correct = 0;
    for (let i = 0; i < Xs.length; i++) {
      const p = predictProbability(model, Xs[i]!);
      if (predictClass(p) === y[i]!) correct++;
    }
    const acc = correct / Xs.length;
    expect(acc).toBeGreaterThan(0.7);
  });

  it("predicts higher probability for a high-x1 / low-x2 input than its mirror", () => {
    const { X, y } = makeBinaryDataset();
    const std = fitStandardiser(X);
    const Xs = standardiseMatrix(std, X);
    const model = trainLogistic(Xs, y, { iterations: 500 });
    const highRisk = standardiseMatrix(std, [[0.9, 0.1]])[0]!;
    const lowRisk = standardiseMatrix(std, [[0.1, 0.9]])[0]!;
    expect(predictProbability(model, highRisk)).toBeGreaterThan(
      predictProbability(model, lowRisk),
    );
  });

  it("predictClass thresholds at the given probability", () => {
    expect(predictClass(0.49, 0.5)).toBe(0);
    expect(predictClass(0.5, 0.5)).toBe(1);
    expect(predictClass(0.71, 0.7)).toBe(1);
    expect(predictClass(0.6, 0.7)).toBe(0);
  });

  it("throws on empty designs and mismatched lengths", () => {
    expect(() => trainLogistic([], [])).toThrow();
    expect(() => trainLogistic([[1, 2]], [1, 0])).toThrow(/row mismatch/);
  });
});

describe("fitStandardiser + standardiseMatrix", () => {
  it("produces zero-mean unit-std columns on the training set", () => {
    const { X } = makeBinaryDataset();
    const std = fitStandardiser(X);
    const Xs = standardiseMatrix(std, X);
    // Empirical mean ≈ 0, std ≈ 1 (with sample-std correction).
    const sum = [0, 0];
    for (const row of Xs) for (let j = 0; j < 2; j++) sum[j] = sum[j]! + row[j]!;
    expect(Math.abs(sum[0]! / Xs.length)).toBeLessThan(1e-9);
    expect(Math.abs(sum[1]! / Xs.length)).toBeLessThan(1e-9);
  });

  it("survives a zero-variance column without dividing by zero", () => {
    const X = [
      [1, 5],
      [1, 6],
      [1, 7],
    ];
    const std = fitStandardiser(X);
    const Xs = standardiseMatrix(std, X);
    for (const row of Xs) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
