/**
 * Resource Diversity Index (RDI)
 *
 * Measures how evenly a learner distributes activity across distinct
 * resource types over a window of time. Defined as normalised Shannon entropy
 * — see docs/data-model.md §2 and docs/causal-methodology.md §2.
 *
 *   Let p_i = fraction of total weighted activity on resource type i.
 *   H      = -Σ p_i · log2(p_i)                       (Shannon entropy, base 2)
 *   RDI    = H / log2(N_catalogue)                    (normalised to [0, 1])
 *
 * `N_catalogue` is the **canonical** number of resource types available in
 * the course (5 in EduRAG), NOT the count of types the student touched. This
 * means a student who concentrates on a single type scores low, AND a student
 * who only uses 2 of 5 available types scores lower than one who spreads
 * across all 5.
 *
 * Edge cases (verified by unit tests):
 *   - No activity                  → 0
 *   - Single resource type used    → 0
 *   - All N types used evenly      → 1
 *
 * Weights are typically `duration_seconds`, but any non-negative scalar works
 * since only ratios matter. Zero-weight types are ignored, not penalised.
 */

export const RESOURCE_TYPES = ["VIDEO", "READING", "QUIZ", "FORUM", "LAB"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const TOTAL_RESOURCE_TYPES = RESOURCE_TYPES.length;

export type ResourceUsage = Partial<Record<ResourceType, number>>;

export interface RdiResult {
  /** Diversity index in [0, 1]. */
  value: number;
  /** Number of distinct resource types with non-zero weight. */
  observedTypes: number;
  /** Sum of all weights. */
  totalWeight: number;
}

/**
 * Compute the Resource Diversity Index for a per-type weight map.
 *
 * @param usage Map of resource type → cumulative weight (e.g. seconds).
 * @param totalCatalogueTypes Total number of resource types available in the
 *   catalogue. Defaults to {@link TOTAL_RESOURCE_TYPES}. Must be ≥ 2.
 */
export function computeRdi(
  usage: ResourceUsage,
  totalCatalogueTypes: number = TOTAL_RESOURCE_TYPES,
): RdiResult {
  if (totalCatalogueTypes < 2) {
    throw new RangeError(
      `RDI requires a catalogue of at least 2 resource types (got ${totalCatalogueTypes})`,
    );
  }

  const entries = (Object.entries(usage) as Array<[ResourceType, number | undefined]>)
    .filter((entry): entry is [ResourceType, number] => (entry[1] ?? 0) > 0);
  const totalWeight = entries.reduce((acc, [, w]) => acc + w, 0);
  const observedTypes = entries.length;

  if (totalWeight <= 0 || observedTypes === 0) {
    return { value: 0, observedTypes: 0, totalWeight: 0 };
  }
  if (observedTypes === 1) {
    return { value: 0, observedTypes: 1, totalWeight };
  }

  let entropy = 0;
  for (const [, w] of entries) {
    const p = w / totalWeight;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(totalCatalogueTypes);
  const value = entropy / maxEntropy;
  // Numerical safety: clamp to [0, 1].
  return {
    value: Math.max(0, Math.min(1, value)),
    observedTypes,
    totalWeight,
  };
}

/** Aggregate a sequence of (type, duration) events into a per-type weight map. */
export function buildUsageFromDurations(
  events: ReadonlyArray<{ resourceType: ResourceType; durationSeconds: number }>,
): ResourceUsage {
  const usage: ResourceUsage = {};
  for (const e of events) {
    usage[e.resourceType] = (usage[e.resourceType] ?? 0) + e.durationSeconds;
  }
  return usage;
}
