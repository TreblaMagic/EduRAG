/**
 * EduRAG counterfactual / what-if simulator.
 *
 * Applies a cohort-level causal estimate (a `CausalEstimate` β with bootstrap
 * CI bounds) to a per-student feature delta and projects an outcome. Ranks
 * candidate interventions by a combination of:
 *
 *   - **Effect size** (the size of the projected gain, sign-aware).
 *   - **Student headroom** (how much room the student actually has, clamped
 *     against the cohort ceiling and any theoretical feature bound).
 *   - **Weakness vs. cohort** (z-score below cohort mean → bonus; above → muted).
 *   - **Confidence** (refutation pass count: high / medium / low).
 *
 * **Honesty constraint (binding).** Outputs are *model-based projections*,
 * not personal causal effects. Explanation prose is built from a controlled
 * vocabulary and is asserted by tests to never contain "guaranteed",
 * "proven", "definitely", or "will improve". Every projection carries the
 * caveat "cohort-average effect applied to this student" and "model-based
 * simulation; recommendation based on current model assumptions".
 *
 * No I/O. The Prisma-facing orchestration lives in
 * `src/server/causal/run-simulations.ts`.
 */

import type { CausalNode } from "./dag";
import type { FeatureRow } from "./feature-table";

// ---- Public types ----------------------------------------------------------

/** A candidate counterfactual: change `treatment` by `delta` (treatment's units). */
export interface InterventionProposal {
  /** Snake-case identifier persisted as `InterventionSimulation.interventionName`. */
  name: string;
  treatment: CausalNode;
  /** Requested change to apply (positive = increase). */
  delta: number;
  /** Human-readable headline used in explanation prose. */
  label: string;
  /** Plain-English advice surfaced to advisors / students. */
  actionHint: string;
}

/** Minimal projection of a `CausalEstimate` row sufficient for the simulator. */
export interface CausalEstimateSummary {
  treatment: CausalNode;
  outcome: CausalNode;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  /** True iff every persisted refutation check passed. */
  refutationPassesAll: boolean;
  /** True iff at least one persisted refutation check passed. */
  refutationPassesAny: boolean;
}

export interface CohortStats {
  mean: Partial<Record<CausalNode, number>>;
  stdev: Partial<Record<CausalNode, number>>;
  min: Partial<Record<CausalNode, number>>;
  max: Partial<Record<CausalNode, number>>;
  size: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface SimulatedIntervention {
  studentId: string;
  courseId: string;
  interventionName: string;
  treatment: CausalNode;
  baselineValue: number;
  proposedValue: number;
  /** Actual change applied after headroom + feature-bound clamping. */
  appliedDelta: number;
  estimatedEffect: number;
  baselineGrade: number;
  projectedGrade: number;
  projectedLow: number;
  projectedHigh: number;
  headroom: number;
  weaknessScore: number;
  rankScore: number;
  confidence: ConfidenceLevel;
  explanation: string;
  assumptions: string[];
}

// ---- Catalogue -------------------------------------------------------------

const NODE_LABEL: Record<CausalNode, string> = {
  PriorGPA: "Prior GPA",
  Engagement: "Engagement",
  ResourceDiversityIndex: "Resource Diversity Index",
  ForumParticipation: "Forum Participation",
  QuizConsistency: "Quiz Consistency",
  AssessmentTrend: "Assessment Trend",
  FinalGrade: "Final Grade",
};

/** Theoretical (not cohort-observed) bounds for features that have them. */
const FEATURE_BOUNDS: Partial<Record<CausalNode, { min: number; max: number }>> = {
  Engagement: { min: 0, max: 1 },
  ResourceDiversityIndex: { min: 0, max: 1 },
  QuizConsistency: { min: 0, max: 1 },
  // ForumParticipation and AssessmentTrend are open-ended; rely on cohort stats.
};

const GRADE_MIN = 0;
const GRADE_MAX = 100;

/**
 * The default catalogue of interventions surfaced by the dashboard.
 * Each one is a small, plausibly-actionable change in one feature.
 */
export const STANDARD_INTERVENTIONS: readonly InterventionProposal[] = [
  {
    name: "increase_resource_diversity",
    treatment: "ResourceDiversityIndex",
    delta: 0.15,
    label: "Increase Resource Diversity Index by 0.15",
    actionHint: "Explore quizzes, forums, and labs in addition to videos.",
  },
  {
    name: "increase_forum_participation",
    treatment: "ForumParticipation",
    delta: 3.0,
    label: "Increase Forum Participation by 3 posts/week",
    actionHint: "Post or comment in the course forum a few more times each week.",
  },
  {
    name: "improve_quiz_consistency",
    treatment: "QuizConsistency",
    delta: 0.10,
    label: "Improve Quiz Consistency by 0.10",
    actionHint: "Space quiz practice across the week so weekly scores stay steady.",
  },
  {
    name: "improve_assessment_trend",
    treatment: "AssessmentTrend",
    delta: 0.10,
    label: "Improve Assessment Trend by 0.10",
    actionHint: "Re-review weak earlier topics so quiz scores trend upward across weeks.",
  },
];

// ---- Cohort stats ----------------------------------------------------------

export function computeCohortStats(rows: ReadonlyArray<FeatureRow>): CohortStats {
  const keys = Object.keys(NODE_LABEL) as CausalNode[];
  const mean: Partial<Record<CausalNode, number>> = {};
  const stdev: Partial<Record<CausalNode, number>> = {};
  const min: Partial<Record<CausalNode, number>> = {};
  const max: Partial<Record<CausalNode, number>> = {};

  if (rows.length === 0) {
    for (const k of keys) {
      mean[k] = 0;
      stdev[k] = 0;
      min[k] = 0;
      max[k] = 0;
    }
    return { mean, stdev, min, max, size: 0 };
  }

  for (const k of keys) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (const r of rows) {
      const v = r.features[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
    }
    const m = sum / rows.length;
    let sqDev = 0;
    for (const r of rows) {
      const d = r.features[k] - m;
      sqDev += d * d;
    }
    mean[k] = m;
    stdev[k] = Math.sqrt(sqDev / rows.length);
    min[k] = lo;
    max[k] = hi;
  }
  return { mean, stdev, min, max, size: rows.length };
}

// ---- Simulation API --------------------------------------------------------

export function simulateIntervention(
  row: FeatureRow,
  intervention: InterventionProposal,
  estimate: CausalEstimateSummary,
  cohortStats: CohortStats,
): SimulatedIntervention {
  if (estimate.treatment !== intervention.treatment) {
    throw new Error(
      `simulateIntervention: estimate.treatment=${estimate.treatment} does not match intervention.treatment=${intervention.treatment}`,
    );
  }

  const baselineValue = row.features[intervention.treatment];
  const baselineGrade = row.features.FinalGrade;

  const headroom = computeHeadroom(intervention.treatment, baselineValue, cohortStats);
  const requestedDelta = intervention.delta;
  const clampedDelta = requestedDelta >= 0 ? Math.min(requestedDelta, headroom) : requestedDelta;
  const proposedValue = clampToFeatureBounds(
    intervention.treatment,
    baselineValue + clampedDelta,
  );
  const appliedDelta = proposedValue - baselineValue;

  // Apply β + CI bounds to the actually-applied delta.
  const projectedDeltaPoint = estimate.estimate * appliedDelta;
  const projectedDeltaA = estimate.ciLow * appliedDelta;
  const projectedDeltaB = estimate.ciHigh * appliedDelta;
  const lowDelta = Math.min(projectedDeltaA, projectedDeltaB);
  const highDelta = Math.max(projectedDeltaA, projectedDeltaB);

  const projectedGrade = clampGrade(baselineGrade + projectedDeltaPoint);
  const projectedLow = clampGrade(baselineGrade + lowDelta);
  const projectedHigh = clampGrade(baselineGrade + highDelta);

  const weaknessScore = computeWeaknessScore(intervention.treatment, baselineValue, cohortStats);
  const confidence = computeConfidence(estimate);
  const confidenceWeight = confidenceWeightFor(confidence);

  const projectedGain = projectedGrade - baselineGrade;
  const baseScore = Math.max(0, projectedGain);
  const rankScore = baseScore * (0.5 + 0.5 * weaknessScore) * confidenceWeight;

  const sim: SimulatedIntervention = {
    studentId: row.studentId,
    courseId: row.courseId,
    interventionName: intervention.name,
    treatment: intervention.treatment,
    baselineValue: round4(baselineValue),
    proposedValue: round4(proposedValue),
    appliedDelta: round4(appliedDelta),
    estimatedEffect: round4(estimate.estimate),
    baselineGrade: round4(baselineGrade),
    projectedGrade: round4(projectedGrade),
    projectedLow: round4(projectedLow),
    projectedHigh: round4(projectedHigh),
    headroom: round4(headroom),
    weaknessScore: round4(weaknessScore),
    rankScore: round4(rankScore),
    confidence,
    explanation: "",
    assumptions: standardAssumptions(),
  };
  sim.explanation = generateExplanation(sim, intervention);
  return sim;
}

export function simulateMultipleInterventions(
  row: FeatureRow,
  interventions: ReadonlyArray<InterventionProposal>,
  causalEstimates: ReadonlyMap<CausalNode, CausalEstimateSummary>,
  cohortStats: CohortStats,
): SimulatedIntervention[] {
  const out: SimulatedIntervention[] = [];
  for (const i of interventions) {
    const e = causalEstimates.get(i.treatment);
    if (!e) continue; // skip interventions for which no estimate exists yet
    out.push(simulateIntervention(row, i, e, cohortStats));
  }
  return out;
}

/** Returns the input list sorted by `rankScore` desc, optionally truncated to top-N. */
export function rankRecommendedInterventions(
  simulated: ReadonlyArray<SimulatedIntervention>,
  topN?: number,
): SimulatedIntervention[] {
  const sorted = [...simulated].sort((a, b) => b.rankScore - a.rankScore);
  return topN === undefined ? sorted : sorted.slice(0, Math.max(0, topN));
}

// ---- Internals -------------------------------------------------------------

function computeHeadroom(
  treatment: CausalNode,
  current: number,
  stats: CohortStats,
): number {
  const m = stats.mean[treatment] ?? current;
  const sd = stats.stdev[treatment] ?? 0;
  const cohortCeiling = m + 2 * sd; // ~p97 under normality; conservative.
  const theoretical = FEATURE_BOUNDS[treatment]?.max ?? Number.POSITIVE_INFINITY;
  const ceiling = Math.min(cohortCeiling, theoretical);
  return Math.max(0, ceiling - current);
}

function computeWeaknessScore(
  treatment: CausalNode,
  current: number,
  stats: CohortStats,
): number {
  const m = stats.mean[treatment] ?? current;
  const sd = stats.stdev[treatment] ?? 0;
  if (sd === 0) return 0.5;
  // z>0 means student is below cohort mean (room to improve).
  const z = (m - current) / sd;
  return clamp01(0.5 + 0.25 * z);
}

function clampGrade(g: number): number {
  if (!Number.isFinite(g)) return GRADE_MIN;
  return Math.max(GRADE_MIN, Math.min(GRADE_MAX, g));
}

function clampToFeatureBounds(treatment: CausalNode, v: number): number {
  const b = FEATURE_BOUNDS[treatment];
  if (!b) return v;
  return Math.max(b.min, Math.min(b.max, v));
}

function computeConfidence(e: CausalEstimateSummary): ConfidenceLevel {
  if (e.refutationPassesAll) return "high";
  if (e.refutationPassesAny) return "medium";
  return "low";
}

function confidenceWeightFor(c: ConfidenceLevel): number {
  switch (c) {
    case "high":
      return 1.0;
    case "medium":
      return 0.7;
    case "low":
      return 0.3;
  }
}

function standardAssumptions(): string[] {
  return [
    "Cohort-average effect applied to this student",
    "Linear functional form for the treatment effect",
    "Confounders limited to PriorGPA and Engagement",
    "Confidence interval reflects sampling variance, not model misspecification",
  ];
}

function generateExplanation(
  sim: SimulatedIntervention,
  intervention: InterventionProposal,
): string {
  const label = NODE_LABEL[sim.treatment];
  const baseline = sim.baselineValue.toFixed(2);
  const proposed = sim.proposedValue.toFixed(2);
  const gain = sim.projectedGrade - sim.baselineGrade;
  const lowDelta = sim.projectedLow - sim.baselineGrade;
  const highDelta = sim.projectedHigh - sim.baselineGrade;

  const parts: string[] = [];
  parts.push(
    `Changing ${label} from ${baseline} to ${proposed} projects a final-grade change of ${signed(gain)} points ` +
      `(estimated improvement range: ${signed(lowDelta)} to ${signed(highDelta)}).`,
  );
  parts.push(
    `Cohort-average effect of ${sim.estimatedEffect.toFixed(2)} grade points per unit ${label} is applied to this student.`,
  );
  parts.push("Model-based simulation; recommendation based on current model assumptions.");

  if (lowDelta < 0 && highDelta > 0) {
    parts.push("The model cannot rule out no effect.");
  }
  if (sim.appliedDelta + 1e-9 < intervention.delta) {
    parts.push(
      `Headroom limited the requested change of ${signed(intervention.delta)} to ${signed(sim.appliedDelta)}.`,
    );
  }
  if (sim.confidence === "low") {
    parts.push("Confidence is low: refutation checks did not pass.");
  } else if (sim.confidence === "medium") {
    parts.push("Confidence is medium: only one refutation check passed.");
  }
  return parts.join(" ");
}

function signed(x: number): string {
  return (x >= 0 ? "+" : "") + x.toFixed(2);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
