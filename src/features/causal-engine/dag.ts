/**
 * EduRAG causal DAG.
 *
 * The project's *hypothesised* causal structure for student success — see
 * docs/causal-methodology.md §3. This module is the single source of truth
 * for which variables are treated as causes vs. effects, and is exported
 * as JSON for the Phase 5 UI to render.
 *
 * **Honesty constraint.** This DAG is a starting hypothesis, not a
 * discovered structure. Effect estimates derived from it are *model-based*,
 * not proof of real-world causation. Demos must say "estimated effect"
 * or "likely causal driver", never "proven cause".
 */

export const CAUSAL_NODES = [
  "PriorGPA",
  "Engagement",
  "ResourceDiversityIndex",
  "ForumParticipation",
  "QuizConsistency",
  "AssessmentTrend",
  "FinalGrade",
] as const;

export type CausalNode = (typeof CAUSAL_NODES)[number];

export interface CausalEdge {
  from: CausalNode;
  to: CausalNode;
  rationale: string;
}

/**
 * The hypothesised DAG. Each edge is annotated with the substantive reason
 * we believe it points the way it does — reviewers can disagree with any
 * single edge without invalidating the framework.
 */
export const CAUSAL_EDGES: readonly CausalEdge[] = [
  {
    from: "PriorGPA",
    to: "Engagement",
    rationale:
      "Stronger baseline learners tend to engage earlier and more consistently.",
  },
  {
    from: "PriorGPA",
    to: "FinalGrade",
    rationale:
      "Prior academic performance predicts future performance even after controlling for current engagement (the direct path).",
  },
  {
    from: "Engagement",
    to: "ResourceDiversityIndex",
    rationale:
      "More-engaged students explore a broader set of resource types.",
  },
  {
    from: "Engagement",
    to: "ForumParticipation",
    rationale:
      "Forum activity is a downstream expression of overall engagement.",
  },
  {
    from: "ResourceDiversityIndex",
    to: "AssessmentTrend",
    rationale:
      "Broader resource use exposes students to more practice modes, improving assessment trajectory over time.",
  },
  {
    from: "ResourceDiversityIndex",
    to: "FinalGrade",
    rationale:
      "Diverse resource use directly raises final outcomes beyond what trend captures.",
  },
  {
    from: "ForumParticipation",
    to: "FinalGrade",
    rationale:
      "Active forum participation correlates with deeper learning and a direct grade lift.",
  },
  {
    from: "QuizConsistency",
    to: "AssessmentTrend",
    rationale:
      "Stable quiz performance shapes the visible assessment trend.",
  },
  {
    from: "QuizConsistency",
    to: "FinalGrade",
    rationale:
      "Consistent quiz performance directly improves the final grade.",
  },
  {
    from: "AssessmentTrend",
    to: "FinalGrade",
    rationale:
      "An improving assessment trajectory leads to higher final outcomes.",
  },
] as const;

/** Baseline adjustment variables used by the MVP backdoor-style estimator.
 *
 * For each treatment T, the adjustment set is `BASELINE_ADJUSTERS \ {T}`.
 * This is conservative — it adjusts for the two strongest known confounders
 * (`PriorGPA` and `Engagement`) without blocking mediation paths. A future
 * phase may swap in a per-treatment backdoor-criterion algorithm. */
export const BASELINE_ADJUSTERS: readonly CausalNode[] = ["PriorGPA", "Engagement"];

/** Compute the adjustment set for estimating `treatment → outcome`. */
export function adjustmentSetFor(treatment: CausalNode): CausalNode[] {
  return BASELINE_ADJUSTERS.filter((a) => a !== treatment);
}

// ---- Graph utilities -------------------------------------------------------

export interface NodeAdjacency {
  parents: CausalNode[];
  children: CausalNode[];
}

/** Build a parents/children index from an edge list. */
export function buildAdjacency(
  edges: readonly CausalEdge[] = CAUSAL_EDGES,
  nodes: readonly CausalNode[] = CAUSAL_NODES,
): Map<CausalNode, NodeAdjacency> {
  const adj = new Map<CausalNode, NodeAdjacency>();
  for (const n of nodes) adj.set(n, { parents: [], children: [] });
  for (const e of edges) {
    adj.get(e.to)?.parents.push(e.from);
    adj.get(e.from)?.children.push(e.to);
  }
  return adj;
}

export function parentsOf(
  node: CausalNode,
  edges: readonly CausalEdge[] = CAUSAL_EDGES,
): CausalNode[] {
  return edges.filter((e) => e.to === node).map((e) => e.from);
}

export function childrenOf(
  node: CausalNode,
  edges: readonly CausalEdge[] = CAUSAL_EDGES,
): CausalNode[] {
  return edges.filter((e) => e.from === node).map((e) => e.to);
}

/**
 * Kahn's algorithm. Returns a valid topological order, or `null` if the
 * graph contains a cycle (i.e. is not a DAG).
 */
export function topologicalSort(
  nodes: readonly CausalNode[] = CAUSAL_NODES,
  edges: readonly CausalEdge[] = CAUSAL_EDGES,
): CausalNode[] | null {
  const inDegree = new Map<CausalNode, number>(nodes.map((n) => [n, 0]));
  for (const e of edges) inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);

  const queue: CausalNode[] = [];
  for (const [n, d] of inDegree) if (d === 0) queue.push(n);

  const sorted: CausalNode[] = [];
  while (queue.length > 0) {
    const n = queue.shift() as CausalNode;
    sorted.push(n);
    for (const child of childrenOf(n, edges)) {
      const d = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }

  return sorted.length === nodes.length ? sorted : null;
}

export function isDag(
  nodes: readonly CausalNode[] = CAUSAL_NODES,
  edges: readonly CausalEdge[] = CAUSAL_EDGES,
): boolean {
  return topologicalSort(nodes, edges) !== null;
}

// ---- JSON export -----------------------------------------------------------

const NODE_LABELS: Record<CausalNode, string> = {
  PriorGPA: "Prior GPA",
  Engagement: "Engagement",
  ResourceDiversityIndex: "Resource Diversity Index",
  ForumParticipation: "Forum Participation",
  QuizConsistency: "Quiz Consistency",
  AssessmentTrend: "Assessment Trend",
  FinalGrade: "Final Grade",
};

export interface DagJson {
  nodes: Array<{ id: CausalNode; label: string }>;
  edges: Array<{ from: CausalNode; to: CausalNode; rationale: string }>;
  isDag: boolean;
  topologicalOrder: CausalNode[] | null;
  baselineAdjusters: CausalNode[];
}

/** Serialisable representation of the DAG for the UI and offline tooling. */
export function toDagJson(): DagJson {
  return {
    nodes: CAUSAL_NODES.map((id) => ({ id, label: NODE_LABELS[id] })),
    edges: CAUSAL_EDGES.map((e) => ({
      from: e.from,
      to: e.to,
      rationale: e.rationale,
    })),
    isDag: isDag(),
    topologicalOrder: topologicalSort(),
    baselineAdjusters: [...BASELINE_ADJUSTERS],
  };
}
