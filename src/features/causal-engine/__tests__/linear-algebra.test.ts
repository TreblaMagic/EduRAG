import { describe, expect, it } from "vitest";

import {
  identity,
  invert,
  matmul,
  matvec,
  ols,
  transpose,
} from "../linear-algebra";

describe("identity / transpose / matmul / matvec", () => {
  it("identity is symmetric and has 1s on the diagonal", () => {
    const I = identity(3);
    expect(I).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("transpose flips rows and columns", () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(transpose(a)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it("matmul multiplies two compatible matrices", () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [5, 6],
      [7, 8],
    ];
    expect(matmul(a, b)).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("matmul throws on dimension mismatch", () => {
    expect(() => matmul([[1, 2]], [[1, 2]])).toThrow(/dimension/);
  });

  it("matvec returns a vector of correct length", () => {
    const a = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    expect(matvec(a, [1, 1])).toEqual([3, 7, 11]);
  });
});

describe("invert", () => {
  it("inverts the identity matrix to itself", () => {
    const I = identity(4);
    const inv = invert(I);
    expect(inv).toEqual(I);
  });

  it("inverts a 2×2 matrix correctly", () => {
    const m = [
      [4, 7],
      [2, 6],
    ];
    const inv = invert(m);
    // det = 10, inv = (1/10) * [[6,-7],[-2,4]]
    expect(inv[0]![0]!).toBeCloseTo(0.6, 9);
    expect(inv[0]![1]!).toBeCloseTo(-0.7, 9);
    expect(inv[1]![0]!).toBeCloseTo(-0.2, 9);
    expect(inv[1]![1]!).toBeCloseTo(0.4, 9);
  });

  it("M · M⁻¹ ≈ I for a non-trivial 3×3", () => {
    const m = [
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
    ];
    const inv = invert(m);
    const product = matmul(m, inv);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i]![j]!).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    }
  });

  it("throws on a singular matrix", () => {
    const singular = [
      [1, 2],
      [2, 4],
    ];
    expect(() => invert(singular)).toThrow(/singular/);
  });

  it("throws on a non-square matrix", () => {
    expect(() => invert([[1, 2, 3]])).toThrow(/not square/);
  });
});

describe("ols", () => {
  it("recovers known intercept and slope for y = 2 + 3x", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 50; i++) {
      const x = i / 10;
      X.push([1, x]);
      y.push(2 + 3 * x);
    }
    const beta = ols(X, y);
    expect(beta[0]!).toBeCloseTo(2, 9);
    expect(beta[1]!).toBeCloseTo(3, 9);
  });

  it("recovers known coefficients in a multivariate fit", () => {
    // True model: y = 1 + 2*x1 - 0.5*x2
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 60; i++) {
      const x1 = (i % 6) - 2;
      const x2 = Math.floor(i / 6) - 4;
      X.push([1, x1, x2]);
      y.push(1 + 2 * x1 - 0.5 * x2);
    }
    const beta = ols(X, y);
    expect(beta[0]!).toBeCloseTo(1, 8);
    expect(beta[1]!).toBeCloseTo(2, 8);
    expect(beta[2]!).toBeCloseTo(-0.5, 8);
  });

  it("throws on mismatched row counts", () => {
    expect(() => ols([[1, 2]], [1, 2])).toThrow(/mismatch/);
  });
});
