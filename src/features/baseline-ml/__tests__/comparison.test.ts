import { describe, expect, it } from "vitest";

import { buildComparison } from "../comparison";
import type { PredictionResult } from "../types";
import type { StudentInterventionRow } from "@/server/queries/students";

function makePrediction(
  overrides: Partial<PredictionResult> = {},
): PredictionResult {
  return {
    studentId: "S1",
    courseId: "C1",
    modelType: "logistic",
    predictedRiskProb: 0.72,
    predictedGrade: null,
    riskClass: "at-risk",
    threshold: 0.5,
    confidence: "medium",
    featureImportance: [
      {
        feature: "MeanRdi",
        value: -0.85,
        absValue: 0.85,
        description: "Standardised coefficient β = -0.85 — lowers predicted risk.",
      },
      {
        feature: "ForumParticipation",
        value: -0.42,
        absValue: 0.42,
        description: "Standardised coefficient β = -0.42 — lowers predicted risk.",
      },
    ],
    notes: ["Probabilistic prediction."],
    warnings: [],
    ...overrides,
  };
}

function makeIntervention(
  overrides: Partial<StudentInterventionRow> = {},
): StudentInterventionRow {
  return {
    interventionSimulationId: "fixture-sim",
    interventionName: "increase_resource_diversity",
    treatment: "ResourceDiversityIndex" as never,
    baselineValue: 0.4,
    proposedValue: 0.55,
    appliedDelta: 0.15,
    estimatedEffect: 12,
    baselineGrade: 65,
    projectedGrade: 67,
    projectedLow: 65.5,
    projectedHigh: 68.5,
    rankScore: 1.5,
    confidence: "high" as never,
    explanation: "Model-based projection.",
    ...overrides,
  };
}

describe("buildComparison", () => {
  it("returns a sensible empty payload when nothing is loaded", () => {
    const out = buildComparison({
      studentId: "S1",
      prediction: null,
      interventions: [],
    });
    expect(out.predictionAvailable).toBe(false);
    expect(out.interventionsAvailable).toBe(false);
    expect(out.predictedRiskClass).toBe(null);
    expect(out.topPredictor).toBe(null);
    expect(out.topIntervention).toBe(null);
    expect(out.insights.length).toBe(1);
    expect(out.insights[0]!.headline).toMatch(/neither/i);
  });

  it("reports agreement when top predictor and top intervention pivot on the same feature", () => {
    const out = buildComparison({
      studentId: "S1",
      prediction: makePrediction(),
      interventions: [makeIntervention()],
    });
    expect(out.predictedRiskPercent).toBeCloseTo(72.0, 1);
    expect(out.topPredictor?.feature).toBe("MeanRdi");
    expect(out.topIntervention?.treatment).toBe("ResourceDiversityIndex");
    expect(
      out.insights.some((i) => i.headline.toLowerCase().includes("agree on the lever")),
    ).toBe(true);
  });

  it("reports disagreement when the strongest predictor differs from the top causal lever", () => {
    const prediction = makePrediction({
      featureImportance: [
        {
          feature: "PriorGPA",
          value: -1.1,
          absValue: 1.1,
          description: "Standardised coefficient β = -1.1 — lowers predicted risk.",
        },
        {
          feature: "MeanRdi",
          value: -0.5,
          absValue: 0.5,
          description: "Standardised coefficient β = -0.5 — lowers predicted risk.",
        },
      ],
    });
    const out = buildComparison({
      studentId: "S1",
      prediction,
      interventions: [makeIntervention()],
    });
    expect(
      out.insights.some((i) =>
        i.headline.toLowerCase().includes("point at different"),
      ),
    ).toBe(true);
  });

  it("emits the WHO vs WHAT-TO-CHANGE insight whenever both layers are present", () => {
    const out = buildComparison({
      studentId: "S1",
      prediction: makePrediction(),
      interventions: [makeIntervention()],
    });
    expect(
      out.insights.some((i) => i.headline.toLowerCase().includes("who")),
    ).toBe(true);
  });

  it("never makes overclaiming causal statements", () => {
    const out = buildComparison({
      studentId: "S1",
      prediction: makePrediction(),
      interventions: [makeIntervention()],
    });
    const blob = out.insights
      .flatMap((i) => [i.headline, i.detail])
      .join(" ")
      .toLowerCase();
    for (const banned of [
      "guaranteed",
      "proven cause",
      "will definitely improve",
      "personal causal effect",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("handles a missing prediction by still surfacing the top intervention", () => {
    const out = buildComparison({
      studentId: "S1",
      prediction: null,
      interventions: [makeIntervention()],
    });
    expect(out.predictionAvailable).toBe(false);
    expect(out.topIntervention?.treatment).toBe("ResourceDiversityIndex");
    expect(
      out.insights.some((i) => i.headline.toLowerCase().includes("top intervention")),
    ).toBe(true);
  });
});
