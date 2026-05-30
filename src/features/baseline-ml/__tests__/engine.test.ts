import { describe, expect, it } from "vitest";

import {
  baselinePredictionEngine,
  selectPredictionEngine,
} from "../engine";
import { PREDICTION_FEATURE_NAMES } from "../types";
import type { PredictionTrainingRow } from "../types";

function makeRows(n = 80, seed = 11): PredictionTrainingRow[] {
  let s = seed;
  const rng = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const rows: PredictionTrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    const priorGpa = 1 + rng() * 3;
    const engagement = 0.1 + rng() * 0.8;
    const rdi = 0.1 + 0.2 * engagement + 0.6 * rng();
    const forum = 0.3 * engagement + rng();
    const quiz = 0.3 + rng() * 0.6;
    const trend = -0.2 + rng() * 0.8;
    const logins = 2 + rng() * 6;
    // Roughly cohort-realistic grade: at-risk emerges when engagement + rdi low.
    // Center the grade distribution near the at-risk threshold (55) so the
    // synthetic cohort contains both classes — the engine refuses to train
    // when all training labels are the same.
    const grade =
      20 +
      4 * priorGpa +
      20 * engagement +
      15 * rdi +
      2 * forum +
      8 * quiz +
      4 * trend +
      (rng() - 0.5) * 6;
    rows.push({
      studentId: `S${i}`,
      courseId: "C1",
      features: {
        PriorGPA: priorGpa,
        MeanEngagement: engagement,
        MeanRdi: rdi,
        ForumParticipation: forum,
        QuizConsistency: quiz,
        AssessmentTrend: trend,
        MeanLoginsPerWeek: logins,
      },
      finalGrade: Math.max(0, Math.min(100, grade)),
    });
  }
  return rows;
}

describe("baselinePredictionEngine", () => {
  it("is always available", async () => {
    expect(await baselinePredictionEngine.available()).toBe(true);
  });

  it("trains and predicts in shape", async () => {
    const rows = makeRows();
    const model = await baselinePredictionEngine.train({
      modelType: "logistic",
      rows,
      threshold: 0.5,
    });
    expect(model.engine).toBe("baseline");
    expect(model.modelType).toBe("logistic");
    expect(model.sampleSize).toBe(rows.length);
    expect(model.trainAccuracy).toBeGreaterThan(0);
    expect(model.featureNames).toEqual(PREDICTION_FEATURE_NAMES);

    const preds = await baselinePredictionEngine.predict({ model, rows });
    expect(preds.length).toBe(rows.length);
    for (const p of preds) {
      expect(p.predictedRiskProb).toBeGreaterThanOrEqual(0);
      expect(p.predictedRiskProb).toBeLessThanOrEqual(1);
      expect(["at-risk", "borderline", "on-track"]).toContain(p.riskClass);
      expect(p.featureImportance.length).toBe(PREDICTION_FEATURE_NAMES.length);
    }
  });

  it("emits at least one at-risk and one on-track prediction on a balanced cohort", async () => {
    const rows = makeRows(120, 21);
    const model = await baselinePredictionEngine.train({
      modelType: "logistic",
      rows,
      threshold: 0.5,
    });
    const preds = await baselinePredictionEngine.predict({ model, rows });
    const labels = new Set(preds.map((p) => p.riskClass));
    expect(labels.size).toBeGreaterThanOrEqual(2);
  });

  it("rejects unsupported model types with a clear error", async () => {
    const rows = makeRows();
    await expect(
      baselinePredictionEngine.train({ modelType: "random_forest", rows }),
    ).rejects.toThrow(/Baseline engine only supports modelType="logistic"/);
  });

  it("rejects single-class training data with a clear error", async () => {
    const rows = makeRows(20).map((r) => ({ ...r, finalGrade: 90 }));
    await expect(
      baselinePredictionEngine.train({ modelType: "logistic", rows }),
    ).rejects.toThrow(/only one class/);
  });

  it("notes language never makes causal claims", async () => {
    const rows = makeRows(60, 5);
    const model = await baselinePredictionEngine.train({
      modelType: "logistic",
      rows,
    });
    const preds = await baselinePredictionEngine.predict({ model, rows });
    const blob = preds.flatMap((p) => p.notes).join(" ").toLowerCase();
    for (const banned of ["guaranteed", "proven", "definitely", "causal effect of this student"]) {
      expect(blob).not.toContain(banned);
    }
    expect(blob).toContain("not");
  });
});

describe("selectPredictionEngine", () => {
  it("returns baseline directly when requested", async () => {
    const sel = await selectPredictionEngine("baseline");
    expect(sel.resolvedName).toBe("baseline");
    expect(sel.warnings).toEqual([]);
  });

  it(
    "honours the requestedName and either resolves to advanced or falls back with a warning",
    async () => {
      const sel = await selectPredictionEngine("advanced");
      expect(sel.requestedName).toBe("advanced");
      if (sel.resolvedName === "advanced") {
        // Python worker + sklearn are reachable on this machine — no fallback needed.
        expect(sel.warnings).toEqual([]);
      } else {
        // Standard local-only path: falls back to the TS baseline with a structured warning.
        expect(sel.resolvedName).toBe("baseline");
        expect(sel.warnings.length).toBeGreaterThan(0);
        expect(sel.warnings[0]!.toLowerCase()).toContain("advanced");
      }
    },
    15_000,
  );
});
