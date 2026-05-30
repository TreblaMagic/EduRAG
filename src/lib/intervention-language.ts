/**
 * Display-language helpers for intervention recommendations.
 *
 * Pure and unit-tested. Centralised so the dashboard never composes its
 * own user-facing intervention strings — they must come from here or from
 * the persisted `explanation` text (which is itself honesty-constrained
 * in `src/features/causal-engine/simulator.ts`).
 */

import type { CausalNode } from "@/features/causal-engine";

const HUMAN_INTERVENTION_LABELS: Record<string, string> = {
  increase_resource_diversity: "Increase Resource Diversity",
  increase_forum_participation: "Increase Forum Participation",
  improve_quiz_consistency: "Improve Quiz Consistency",
  improve_assessment_trend: "Improve Assessment Trend",
};

const HUMAN_FEATURE_LABELS: Record<CausalNode, string> = {
  PriorGPA: "Prior GPA",
  Engagement: "Engagement",
  ResourceDiversityIndex: "Resource Diversity Index",
  ForumParticipation: "Forum Participation",
  QuizConsistency: "Quiz Consistency",
  AssessmentTrend: "Assessment Trend",
  FinalGrade: "Final Grade",
};

/** Friendly label for an intervention catalogue identifier. */
export function interventionLabel(name: string): string {
  return HUMAN_INTERVENTION_LABELS[name] ?? toTitleCase(name);
}

/** Friendly label for a DAG node / feature name. */
export function featureLabel(node: CausalNode): string {
  return HUMAN_FEATURE_LABELS[node];
}

const HUMAN_PREDICTION_FEATURE_LABELS: Record<string, string> = {
  PriorGPA: "Prior GPA",
  MeanEngagement: "Mean Engagement",
  MeanRdi: "Mean RDI",
  ForumParticipation: "Forum Participation",
  QuizConsistency: "Quiz Consistency",
  AssessmentTrend: "Assessment Trend",
  MeanLoginsPerWeek: "Mean Logins / Week",
};

/** Friendly label for a baseline-ML prediction feature name (Phase 8). */
export function predictionFeatureLabel(name: string): string {
  return HUMAN_PREDICTION_FEATURE_LABELS[name] ?? toTitleCase(name);
}

/** Human-facing projection headline, e.g. "+1.27 grade points" or "−0.50 grade points". */
export function projectionHeadline(sim: {
  projectedGrade: number;
  baselineGrade: number;
}): string {
  const delta = sim.projectedGrade - sim.baselineGrade;
  if (!Number.isFinite(delta)) return "—";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} grade points`;
}

/** Whether the CI brackets zero — useful for "cannot rule out" wording. */
export function ciSpansZero(sim: {
  projectedLow: number;
  projectedHigh: number;
  baselineGrade: number;
}): boolean {
  const low = sim.projectedLow - sim.baselineGrade;
  const high = sim.projectedHigh - sim.baselineGrade;
  return low < 0 && high > 0;
}

/** Standardised disclaimer line used in cards and the page banner. */
export const HONESTY_DISCLAIMER =
  "Model-based simulation. Cohort-average effect applied to this student; not a personal guarantee.";

function toTitleCase(snake: string): string {
  return snake
    .split("_")
    .map((s) => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)))
    .join(" ");
}
