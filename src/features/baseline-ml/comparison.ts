/**
 * Phase 8 — prediction-vs-intervention comparison helpers.
 *
 * Pure functions only. The point of these helpers is to make the *core
 * narrative* of the project obvious in code, not just in copy:
 *
 *   Traditional ML  →  "this student is likely at risk."
 *   EduRAG          →  "these are the likely drivers and what to change."
 *
 * The comparison helpers receive both the prediction row and the ranked
 * causal interventions for the same student/course and emit:
 *
 *   - A short, factual difference table (predicted risk vs top intervention gain).
 *   - A list of *insights* — plain-English observations about how the two
 *     systems diverge on this particular student. Insights are generated
 *     from real numbers; we never fabricate.
 *
 * Honesty rules (asserted in tests):
 *   - No phrase implies prediction == intervention recommendation.
 *   - No phrase implies feature importance == causal effect.
 *   - No banned causal words ("guaranteed", "proven", "will improve").
 */

import type { StudentInterventionRow } from "@/server/queries/students";
import type { PredictionResult } from "./types";

export interface ComparisonRow {
  studentId: string;
  /** Optional course code for cohort-level renderings. */
  courseCode?: string;
  prediction: PredictionResult | null;
  /** Causal interventions for this student, already ranked. */
  interventions: StudentInterventionRow[];
}

export interface ComparisonInsight {
  /** Short headline (≤ 60 chars) suitable for a chip or bullet header. */
  headline: string;
  /** One-sentence explanation. */
  detail: string;
  /** UI accent: "neutral" for facts, "warning" for predicted-risk, "positive" for actionable lift. */
  tone: "neutral" | "warning" | "positive";
}

export interface ComparisonSummary {
  studentId: string;
  predictionAvailable: boolean;
  interventionsAvailable: boolean;
  /** Predicted risk class — null when prediction is missing. */
  predictedRiskClass: PredictionResult["riskClass"] | null;
  /** Predicted P(at-risk) rounded to 2dp — null when prediction is missing. */
  predictedRiskPercent: number | null;
  /** Strongest predictor by |β| (logistic) / |importance| (tree). */
  topPredictor: { feature: string; absValue: number } | null;
  /** Top-ranked causal intervention by `rankScore`. */
  topIntervention: {
    interventionName: string;
    treatment: string;
    projectedGain: number;
    confidence: StudentInterventionRow["confidence"];
  } | null;
  insights: ComparisonInsight[];
}

const MIN_GAIN_ACTIONABLE = 0.5;

export function buildComparison(row: ComparisonRow): ComparisonSummary {
  const { prediction, interventions } = row;

  const topPredictor =
    prediction && prediction.featureImportance.length > 0
      ? {
          feature: prediction.featureImportance[0]!.feature,
          absValue: prediction.featureImportance[0]!.absValue,
        }
      : null;

  const topIntervention =
    interventions.length > 0
      ? {
          interventionName: interventions[0]!.interventionName,
          treatment: interventions[0]!.treatment as string,
          projectedGain: interventions[0]!.projectedGrade - interventions[0]!.baselineGrade,
          confidence: interventions[0]!.confidence,
        }
      : null;

  return {
    studentId: row.studentId,
    predictionAvailable: prediction !== null,
    interventionsAvailable: interventions.length > 0,
    predictedRiskClass: prediction?.riskClass ?? null,
    predictedRiskPercent: prediction
      ? Math.round(prediction.predictedRiskProb * 1000) / 10
      : null,
    topPredictor,
    topIntervention,
    insights: buildInsights(prediction, topIntervention, topPredictor),
  };
}

function buildInsights(
  prediction: PredictionResult | null,
  topIntervention: ComparisonSummary["topIntervention"],
  topPredictor: ComparisonSummary["topPredictor"],
): ComparisonInsight[] {
  const insights: ComparisonInsight[] = [];

  if (!prediction && !topIntervention) {
    insights.push({
      headline: "Neither layer has output yet",
      detail:
        "Run `npm run ml:predict` and `npm run causal:simulate` to populate both panels.",
      tone: "neutral",
    });
    return insights;
  }

  if (prediction) {
    insights.push({
      headline:
        prediction.riskClass === "at-risk"
          ? `Prediction flags this student as at-risk (P=${pct(prediction.predictedRiskProb)})`
          : prediction.riskClass === "borderline"
            ? `Prediction is on the fence (P=${pct(prediction.predictedRiskProb)})`
            : `Prediction sees this student on track (P=${pct(prediction.predictedRiskProb)})`,
      detail:
        "Prediction is a probabilistic risk score. It tells you who may need attention; it does not suggest what to change.",
      tone: prediction.riskClass === "at-risk" ? "warning" : "neutral",
    });
  }

  if (topPredictor && topIntervention) {
    const samePivot = featureMatchesTreatment(topPredictor.feature, topIntervention.treatment);
    if (samePivot) {
      insights.push({
        headline: "Prediction and intervention agree on the lever",
        detail: `Both layers point at ${topIntervention.treatment} as the most informative dimension — predictor magnitude and causal headroom line up.`,
        tone: "positive",
      });
    } else {
      insights.push({
        headline: "Prediction and intervention point at different levers",
        detail: `Strongest predictor: ${topPredictor.feature}. Highest-ranked intervention target: ${topIntervention.treatment}. The most predictive feature is not always the most actionable one — feature importance ≠ causal effect.`,
        tone: "neutral",
      });
    }
  } else if (topPredictor) {
    insights.push({
      headline: `Strongest predictor is ${topPredictor.feature}`,
      detail:
        "No causal intervention has been ranked yet, so there is no actionable lever to compare against. Run the simulator to populate the intervention side.",
      tone: "neutral",
    });
  } else if (topIntervention) {
    insights.push({
      headline: `Top intervention is ${topIntervention.treatment}`,
      detail:
        "No prediction row has been generated, so there is nothing to compare the lever against. Run `npm run ml:predict` to populate the prediction side.",
      tone: "neutral",
    });
  }

  if (topIntervention) {
    if (topIntervention.projectedGain >= MIN_GAIN_ACTIONABLE) {
      insights.push({
        headline: `Projected lift of +${topIntervention.projectedGain.toFixed(2)} grade points`,
        detail: `Cohort-average effect applied to this student via the top intervention, paired with a ${topIntervention.confidence}-confidence label from the refutation checks.`,
        tone: "positive",
      });
    } else {
      insights.push({
        headline: "Top intervention is below the actionable threshold",
        detail: `Projected lift of ${topIntervention.projectedGain.toFixed(2)} grade points — too small to be a confident recommendation on this student.`,
        tone: "neutral",
      });
    }
  }

  if (prediction && topIntervention) {
    insights.push({
      headline: "Prediction tells you WHO; intervention tells you WHAT TO CHANGE",
      detail:
        "EduRAG keeps both layers visible so you can decide. Prediction-only systems stop at the risk score.",
      tone: "neutral",
    });
  }

  return insights;
}

const FEATURE_TO_TREATMENT: Record<string, string> = {
  MeanRdi: "ResourceDiversityIndex",
  ForumParticipation: "ForumParticipation",
  QuizConsistency: "QuizConsistency",
  AssessmentTrend: "AssessmentTrend",
};

function featureMatchesTreatment(feature: string, treatment: string): boolean {
  return FEATURE_TO_TREATMENT[feature] === treatment;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
