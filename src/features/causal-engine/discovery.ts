/**
 * Phase 7 — causal discovery (PC-skeleton + v-structure orientation).
 *
 * **Experimental.** The discovered graph is *statistical inference from data*
 * under linearity + Gaussian-noise assumptions. The manually-encoded DAG in
 * `dag.ts` remains the project's domain-knowledge baseline. Discovery is
 * surfaced everywhere as a side-by-side comparison, never as ground truth.
 *
 * Algorithm sketch:
 *   1. Start with a fully-connected undirected graph over the requested nodes.
 *   2. For each pair (X, Y) test conditional independence against every subset
 *      of size `≤ MAX_COND_SIZE` of the current neighbours of X (excluding Y).
 *      If `p-value > alpha`, remove the X–Y edge and record the separating set.
 *   3. Orient v-structures: for each unshielded triple X — Z — Y, if Z is not
 *      in the separating set of (X, Y), orient X → Z ← Y.
 *   4. Apply a single round of Meek's rules to propagate orientations:
 *      - R1: if X → Z and Z — Y and X, Y not adjacent → Z → Y.
 *      - R2: if X → Z → Y and X — Y → X → Y.
 *   5. Remaining undirected edges are reported with `oriented: false`.
 *
 * Limitations:
 *   - Linear / Gaussian noise — same as the estimator.
 *   - Sample-size sensitive at small n; we surface a warning when n < 50.
 *   - Sub-quadratic perf is not attempted; the EduRAG DAG has 7 nodes so it
 *     is irrelevant. Past ~30 nodes consider the Python engine instead.
 */

import type { CausalNode } from "./dag";
import { CAUSAL_NODES } from "./dag";
import type { FeatureRow } from "./feature-table";
import { conditionalIndependenceTest } from "./independence-tests";

const DEFAULT_ALPHA = 0.05;
const MAX_COND_SIZE = 3;
const MIN_SAMPLE_WARN = 50;

export interface DiscoveredEdge {
  from: CausalNode;
  to: CausalNode;
  oriented: boolean;
}

export interface DiscoveryResult {
  algorithm: "pc_partial_correlation";
  alpha: number;
  nodes: CausalNode[];
  edges: DiscoveredEdge[];
  independenceTests: number;
  warnings: string[];
}

export interface DiscoveryOptions {
  nodes?: ReadonlyArray<CausalNode>;
  alpha?: number;
  seed?: number;
}

export function runDiscovery(
  rows: ReadonlyArray<FeatureRow>,
  options: DiscoveryOptions = {},
): DiscoveryResult {
  const nodes = (options.nodes ?? CAUSAL_NODES) as CausalNode[];
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const warnings: string[] = [];

  if (rows.length < MIN_SAMPLE_WARN) {
    warnings.push(
      `Sample size (${rows.length}) below ${MIN_SAMPLE_WARN}; discovery is likely unstable. Treat the discovered DAG as exploratory.`,
    );
  }

  const columns: Record<string, number[]> = {};
  for (const node of nodes) {
    columns[node] = rows.map((r) => r.features[node]);
  }

  // ---- 1. Skeleton phase ---------------------------------------------------
  const adjacent: Map<CausalNode, Set<CausalNode>> = new Map();
  for (const n of nodes) adjacent.set(n, new Set(nodes.filter((m) => m !== n)));

  const sepSet: Map<string, CausalNode[]> = new Map();
  let tests = 0;

  for (let condSize = 0; condSize <= MAX_COND_SIZE; condSize++) {
    const toRemove: Array<[CausalNode, CausalNode, CausalNode[]]> = [];
    for (const x of nodes) {
      const neighbours = [...adjacent.get(x)!];
      if (neighbours.length - 1 < condSize) continue;
      for (const y of neighbours) {
        const others = neighbours.filter((n) => n !== y);
        if (others.length < condSize) continue;
        for (const subset of combinations(others, condSize)) {
          tests++;
          const cond = subset.map((s) => columns[s]!);
          const { pValue } = conditionalIndependenceTest(
            columns[x]!,
            columns[y]!,
            cond,
          );
          if (pValue > alpha) {
            toRemove.push([x, y, subset]);
            break;
          }
        }
      }
    }
    for (const [x, y, subset] of toRemove) {
      adjacent.get(x)?.delete(y);
      adjacent.get(y)?.delete(x);
      sepSet.set(pairKey(x, y), subset);
    }
  }

  // ---- 2. V-structure orientation ------------------------------------------
  const directed: Set<string> = new Set(); // "X->Y"
  for (const z of nodes) {
    const neighboursZ = [...adjacent.get(z)!];
    for (let i = 0; i < neighboursZ.length; i++) {
      for (let j = i + 1; j < neighboursZ.length; j++) {
        const x = neighboursZ[i]!;
        const y = neighboursZ[j]!;
        if (adjacent.get(x)?.has(y)) continue; // X-Y still adjacent → not unshielded
        const sep = sepSet.get(pairKey(x, y)) ?? [];
        if (!sep.includes(z)) {
          directed.add(edgeKey(x, z));
          directed.add(edgeKey(y, z));
        }
      }
    }
  }

  // ---- 3. Meek's rules (one pass each, repeated until quiescence) ----------
  let changed = true;
  let safetyPasses = 0;
  while (changed && safetyPasses++ < 8) {
    changed = false;
    for (const z of nodes) {
      for (const y of adjacent.get(z)!) {
        if (isOriented(directed, z, y) || isOriented(directed, y, z)) continue;
        // R1: X -> Z, Z - Y, X not adjacent to Y  ⇒  Z -> Y
        for (const x of nodes) {
          if (x === z || x === y) continue;
          if (
            isOriented(directed, x, z) &&
            !adjacent.get(x)?.has(y) &&
            !directed.has(edgeKey(z, y))
          ) {
            directed.add(edgeKey(z, y));
            changed = true;
            break;
          }
        }
        if (changed) continue;
        // R2: X -> W -> Y and X - Y  ⇒  X -> Y. Implemented in second-order pass below.
      }
    }
    // R2 sweep over directed pairs.
    for (const x of nodes) {
      for (const y of adjacent.get(x)!) {
        if (isOriented(directed, x, y) || isOriented(directed, y, x)) continue;
        for (const w of nodes) {
          if (w === x || w === y) continue;
          if (isOriented(directed, x, w) && isOriented(directed, w, y)) {
            directed.add(edgeKey(x, y));
            changed = true;
            break;
          }
        }
      }
    }
  }

  // ---- 4. Emit edges -------------------------------------------------------
  const emitted: DiscoveredEdge[] = [];
  const seen: Set<string> = new Set();
  for (const x of nodes) {
    for (const y of adjacent.get(x)!) {
      const xy = directed.has(edgeKey(x, y));
      const yx = directed.has(edgeKey(y, x));
      if (xy && !yx) {
        const k = edgeKey(x, y);
        if (!seen.has(k)) {
          emitted.push({ from: x, to: y, oriented: true });
          seen.add(k);
        }
      } else if (!xy && !yx) {
        // Undirected — emit once in canonical (sorted) order.
        const [a, b] = canonicalPair(x, y);
        const k = edgeKey(a, b);
        if (!seen.has(k)) {
          emitted.push({ from: a, to: b, oriented: false });
          seen.add(k);
        }
      }
    }
  }

  return {
    algorithm: "pc_partial_correlation",
    alpha,
    nodes: [...nodes],
    edges: emitted,
    independenceTests: tests,
    warnings,
  };
}

// ---- diff helper used by the UI -------------------------------------------

export interface DagEdgeDiff {
  manualOnly: Array<{ from: CausalNode; to: CausalNode }>;
  discoveredOnly: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  shared: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
}

export function diffManualVsDiscovered(
  manual: ReadonlyArray<{ from: CausalNode; to: CausalNode }>,
  discovered: ReadonlyArray<DiscoveredEdge>,
): DagEdgeDiff {
  const manualKeys = new Set(manual.map((e) => edgeKey(e.from, e.to)));
  const out: DagEdgeDiff = { manualOnly: [], discoveredOnly: [], shared: [] };

  const discoveredKeys = new Set<string>();
  for (const e of discovered) {
    if (e.oriented) {
      discoveredKeys.add(edgeKey(e.from, e.to));
    } else {
      discoveredKeys.add(edgeKey(e.from, e.to));
      discoveredKeys.add(edgeKey(e.to, e.from));
    }
  }

  for (const m of manual) {
    if (discoveredKeys.has(edgeKey(m.from, m.to))) {
      const oriented = discovered.some(
        (d) => d.oriented && d.from === m.from && d.to === m.to,
      );
      out.shared.push({ from: m.from, to: m.to, oriented });
    } else {
      out.manualOnly.push({ from: m.from, to: m.to });
    }
  }

  for (const d of discovered) {
    if (d.oriented) {
      if (!manualKeys.has(edgeKey(d.from, d.to))) {
        out.discoveredOnly.push({ from: d.from, to: d.to, oriented: true });
      }
    } else {
      const ab = manualKeys.has(edgeKey(d.from, d.to));
      const ba = manualKeys.has(edgeKey(d.to, d.from));
      if (!ab && !ba) {
        out.discoveredOnly.push({ from: d.from, to: d.to, oriented: false });
      }
    }
  }
  return out;
}

// ---- internals -------------------------------------------------------------

function combinations<T>(items: ReadonlyArray<T>, k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const idx = new Array<number>(k);
  for (let i = 0; i < k; i++) idx[i] = i;
  while (true) {
    out.push(idx.map((i) => items[i]!));
    let i = k - 1;
    while (i >= 0 && idx[i]! === items.length - k + i) i--;
    if (i < 0) break;
    idx[i] = idx[i]! + 1;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function edgeKey(a: string, b: string): string {
  return `${a}->${b}`;
}

function canonicalPair<T extends string>(a: T, b: T): [T, T] {
  return a < b ? [a, b] : [b, a];
}

function isOriented(set: Set<string>, a: string, b: string): boolean {
  return set.has(edgeKey(a, b));
}
