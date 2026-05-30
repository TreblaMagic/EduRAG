/**
 * Shared helpers for query modules.
 */

import type { ConfidenceLevel } from "@/features/causal-engine";

interface PersistedRefutation {
  placebo?: { passes?: boolean };
  randomCommonCause?: { passes?: boolean };
}

/** Map a persisted `CausalEstimate.refutationJson` string to a categorical confidence. */
export function confidenceForRefutationJson(refutationJson: string | null): ConfidenceLevel {
  if (!refutationJson) return "low";
  let parsed: PersistedRefutation;
  try {
    parsed = JSON.parse(refutationJson) as PersistedRefutation;
  } catch {
    return "low";
  }
  const placebo = Boolean(parsed.placebo?.passes);
  const rcc = Boolean(parsed.randomCommonCause?.passes);
  if (placebo && rcc) return "high";
  if (placebo || rcc) return "medium";
  return "low";
}
