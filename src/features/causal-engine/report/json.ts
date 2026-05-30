/**
 * Phase 7 — JSON causal report.
 *
 * Wraps the canonical {@link CausalReport} in a pretty-printed JSON string
 * suitable for download. The shape matches `types.ts` exactly so any
 * downstream tooling can rely on a stable schema (`phase-7.v1`).
 */

import type { CausalReport } from "./types";

export function renderJsonReport(report: CausalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
