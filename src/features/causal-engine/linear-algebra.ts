/**
 * Tiny linear-algebra utilities sufficient for OLS via the normal equations.
 *
 * Designed for small problems (number of features ≲ 10, rows ≲ 100k).
 * Not intended as a general numerical library — for anything larger or
 * ill-conditioned, reach for a real package.
 */

export type Matrix = number[][];
export type Vector = number[];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
}

export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i]![i] = 1;
  return m;
}

export function transpose(m: Matrix): Matrix {
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const t = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      t[j]![i] = m[i]![j]!;
    }
  }
  return t;
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const aRows = a.length;
  const aCols = a[0]?.length ?? 0;
  const bRows = b.length;
  const bCols = b[0]?.length ?? 0;
  if (aCols !== bRows) {
    throw new Error(
      `matmul dimension mismatch: ${aRows}x${aCols} × ${bRows}x${bCols}`,
    );
  }
  const c = zeros(aRows, bCols);
  for (let i = 0; i < aRows; i++) {
    const ai = a[i]!;
    const ci = c[i]!;
    for (let k = 0; k < aCols; k++) {
      const aik = ai[k]!;
      if (aik === 0) continue;
      const bk = b[k]!;
      for (let j = 0; j < bCols; j++) {
        ci[j] = ci[j]! + aik * bk[j]!;
      }
    }
  }
  return c;
}

export function matvec(m: Matrix, v: Vector): Vector {
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  if (cols !== v.length) {
    throw new Error(
      `matvec dimension mismatch: ${rows}x${cols} × ${v.length}`,
    );
  }
  const out: Vector = new Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    const mi = m[i]!;
    for (let j = 0; j < cols; j++) s += mi[j]! * v[j]!;
    out[i] = s;
  }
  return out;
}

/**
 * Invert a square matrix via Gauss-Jordan elimination with partial pivoting.
 * Throws if the matrix is (numerically) singular.
 *
 * Cost: O(n³). Fine for the small design matrices we use (≤ 10×10).
 */
export function invert(m: Matrix): Matrix {
  const n = m.length;
  if (n === 0 || m.some((r) => r.length !== n)) {
    throw new Error("invert: matrix is not square");
  }

  // Augment with identity.
  const aug: Matrix = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting: largest abs value in current column.
    let pivotRow = col;
    let pivotMax = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(aug[r]![col]!);
      if (v > pivotMax) {
        pivotMax = v;
        pivotRow = r;
      }
    }
    if (pivotMax < 1e-12) {
      throw new Error(`invert: matrix is singular at column ${col}`);
    }

    if (pivotRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }

    // Scale pivot row so the pivot is 1.
    const pivot = aug[col]![col]!;
    const augCol = aug[col]!;
    for (let j = 0; j < 2 * n; j++) augCol[j] = augCol[j]! / pivot;

    // Eliminate all other rows in this column.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r]![col]!;
      if (factor === 0) continue;
      const augR = aug[r]!;
      for (let j = 0; j < 2 * n; j++) {
        augR[j] = augR[j]! - factor * augCol[j]!;
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * Ordinary Least Squares via normal equations.
 *
 *   β = (X'X)^-1 X'y      for the model y = Xβ + ε.
 *
 * Returns the coefficient vector. The caller is responsible for prepending
 * a column of 1s to `X` if an intercept term is desired.
 */
export function ols(X: Matrix, y: Vector): Vector {
  if (X.length !== y.length) {
    throw new Error(`ols: row count mismatch X=${X.length} y=${y.length}`);
  }
  if (X.length === 0) throw new Error("ols: empty design matrix");
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);
  const XtXinv = invert(XtX);
  const Xty = matvec(Xt, y);
  return matvec(XtXinv, Xty);
}
