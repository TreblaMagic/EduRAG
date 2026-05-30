import { describe, expect, it } from "vitest";

import { adjustmentSetFor } from "../dag";
import { estimateEffectPoint } from "../estimator";
import type { FeatureRow } from "../feature-table";
import { runExtendedRefutations } from "../refutation-extended";
import { mulberry32 } from "../rng";

function makeRows({
  n = 250,
  seed = 4,
  trueRdiEffect = 12,
}: { n?: number; seed?: number; trueRdiEffect?: number } = {}): FeatureRow[] {
  const rng = mulberry32(seed);
  const rows: FeatureRow[] = [];
  for (let i = 0; i < n; i++) {
    const priorGpa = 1 + rng() * 3;
    const engagement = 0.1 + rng() * 0.8;
    const rdi = Math.max(0, Math.min(1, 0.2 + 0.1 * engagement + 0.5 * rng()));
    const forum = 0.2 * engagement + rng();
    const quiz = 0.3 + rng() * 0.6;
    const trend = -0.2 + rng() * 0.8;
    const noise = (rng() - 0.5) * 1.0;
    const grade =
      50 +
      6 * priorGpa +
      10 * engagement +
      trueRdiEffect * rdi +
      4 * forum +
      8 * quiz +
      6 * trend +
      noise;
    rows.push({
      studentId: `S${i}`,
      courseId: "C1",
      features: {
        PriorGPA: priorGpa,
        Engagement: engagement,
        ResourceDiversityIndex: rdi,
        ForumParticipation: forum,
        QuizConsistency: quiz,
        AssessmentTrend: trend,
        FinalGrade: grade,
      },
    });
  }
  return rows;
}

describe("runExtendedRefutations", () => {
  it("flags a strong real effect as passing all four checks", () => {
    const rows = makeRows({ trueRdiEffect: 12 });
    const point = estimateEffectPoint(rows, "ResourceDiversityIndex", "FinalGrade").estimate;
    const out = runExtendedRefutations(
      rows,
      "ResourceDiversityIndex",
      "FinalGrade",
      point,
      { subsetIterations: 30, bootstrapIterations: 100 },
    );
    expect(out.subsetRobustness.passes).toBe(true);
    expect(out.bootstrapStability.passes).toBe(true);
    expect(out.sensitivity.passes).toBe(true);
    expect(out.outcomePermutation.passes).toBe(true);
  });

  it("flags a zero-effect treatment as failing the outcome-permutation check loosely", () => {
    const rows = makeRows({ trueRdiEffect: 0 });
    const point = estimateEffectPoint(rows, "ResourceDiversityIndex", "FinalGrade").estimate;
    const out = runExtendedRefutations(
      rows,
      "ResourceDiversityIndex",
      "FinalGrade",
      point,
      { subsetIterations: 30, bootstrapIterations: 100 },
    );
    // The outcome-permutation ratio compares against |original|; tiny originals
    // make the ratio explode (high values, often > 1), which we expect to fail
    // the < 0.3 threshold.
    expect(out.outcomePermutation.passes).toBe(false);
  });

  it("returns one entry per adjuster in the sensitivity check", () => {
    const rows = makeRows();
    const point = estimateEffectPoint(rows, "ResourceDiversityIndex", "FinalGrade").estimate;
    const out = runExtendedRefutations(rows, "ResourceDiversityIndex", "FinalGrade", point, {
      subsetIterations: 10,
      bootstrapIterations: 30,
    });
    const adj = adjustmentSetFor("ResourceDiversityIndex");
    expect(out.sensitivity.perAdjuster).toHaveLength(adj.length);
    const dropped = out.sensitivity.perAdjuster.map((p) => p.droppedAdjuster).sort();
    expect(dropped).toEqual([...adj].sort());
  });

  it("emits structured pass/fail flags that the UI can render", () => {
    const rows = makeRows();
    const point = estimateEffectPoint(rows, "ResourceDiversityIndex", "FinalGrade").estimate;
    const out = runExtendedRefutations(rows, "ResourceDiversityIndex", "FinalGrade", point, {
      subsetIterations: 10,
      bootstrapIterations: 30,
    });
    for (const key of [
      "subsetRobustness",
      "bootstrapStability",
      "sensitivity",
      "outcomePermutation",
    ] as const) {
      const v = out[key];
      expect(typeof v.passes).toBe("boolean");
      expect(typeof v.description).toBe("string");
      expect(v.description.length).toBeGreaterThan(10);
    }
  });
});
