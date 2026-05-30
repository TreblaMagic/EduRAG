import { describe, expect, it } from "vitest";

import { adjustmentSetFor, type CausalNode } from "../dag";
import { estimateEffect, estimateEffectPoint } from "../estimator";
import type { FeatureRow } from "../feature-table";
import { mulberry32 } from "../rng";

/**
 * Build a synthetic feature table with a known generative model:
 *
 *   FinalGrade = 50
 *              + 6.0  * PriorGPA
 *              + 10.0 * Engagement
 *              + trueRdiEffect * RDI
 *              + trueForumEffect * ForumParticipation
 *              + trueQuizConsistencyEffect * QuizConsistency
 *              + trueAssessmentTrendEffect * AssessmentTrend
 *              + ε
 *
 * The estimator should recover the true effects for each treatment when
 * adjusting for {PriorGPA, Engagement}.
 */
interface SyntheticOptions {
  n?: number;
  seed?: number;
  noiseSd?: number;
  trueRdiEffect?: number;
  trueForumEffect?: number;
  trueQuizConsistencyEffect?: number;
  trueAssessmentTrendEffect?: number;
}

function makeSyntheticRows(opts: SyntheticOptions = {}): FeatureRow[] {
  const n = opts.n ?? 500;
  const seed = opts.seed ?? 1;
  const noiseSd = opts.noiseSd ?? 1.0;
  const trueRdi = opts.trueRdiEffect ?? 12;
  const trueForum = opts.trueForumEffect ?? 4;
  const trueQuizCons = opts.trueQuizConsistencyEffect ?? 8;
  const trueAssTrend = opts.trueAssessmentTrendEffect ?? 6;

  const rng = mulberry32(seed);
  const rows: FeatureRow[] = [];
  for (let i = 0; i < n; i++) {
    const priorGpa = 1 + rng() * 3;                  // [1, 4]
    const engagement = clamp01(0.1 + rng() * 0.8);   // [0.1, 0.9]
    // Weak dependence on Engagement so the treatment retains independent
    // variance for OLS to identify cleanly.
    const rdi = clamp01(0.1 + 0.2 * engagement + 0.6 * rng());
    const forum = 0.3 * engagement + rng() * 1.0;
    const quizCons = clamp01(0.3 + rng() * 0.6);
    const assTrend = -0.2 + rng() * 0.8;             // [-0.2, 0.6]
    const noise = boxMuller(rng) * noiseSd;
    const finalGrade =
      50 +
      6.0 * priorGpa +
      10.0 * engagement +
      trueRdi * rdi +
      trueForum * forum +
      trueQuizCons * quizCons +
      trueAssTrend * assTrend +
      noise;

    rows.push({
      studentId: `S${i}`,
      courseId: "C1",
      features: {
        PriorGPA: priorGpa,
        Engagement: engagement,
        ResourceDiversityIndex: rdi,
        ForumParticipation: forum,
        QuizConsistency: quizCons,
        AssessmentTrend: assTrend,
        FinalGrade: finalGrade,
      },
    });
  }
  return rows;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function boxMuller(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe("estimateEffectPoint", () => {
  it("recovers a known RDI effect within tolerance", () => {
    const rows = makeSyntheticRows({ trueRdiEffect: 12, noiseSd: 1.0 });
    const out = estimateEffectPoint(rows, "ResourceDiversityIndex", "FinalGrade");
    expect(out.adjustmentSet).toEqual(adjustmentSetFor("ResourceDiversityIndex"));
    expect(out.sampleSize).toBe(rows.length);
    // Tolerance ±3 reflects finite-sample variance + adjuster collinearity.
    expect(Math.abs(out.estimate - 12)).toBeLessThan(3);
  });

  it("recovers a known ForumParticipation effect within tolerance", () => {
    const rows = makeSyntheticRows({ trueForumEffect: 4, noiseSd: 1.0 });
    const out = estimateEffectPoint(rows, "ForumParticipation", "FinalGrade");
    expect(Math.abs(out.estimate - 4)).toBeLessThan(2);
  });

  it("returns ≈ 0 when the true effect is zero", () => {
    const rows = makeSyntheticRows({ trueQuizConsistencyEffect: 0, noiseSd: 0.5 });
    const out = estimateEffectPoint(rows, "QuizConsistency", "FinalGrade");
    expect(Math.abs(out.estimate)).toBeLessThan(1.5);
  });
});

describe("estimateEffect (full, with bootstrap CI)", () => {
  it("returns a CI that is near the true effect and contains the point estimate", () => {
    const rows = makeSyntheticRows({ trueRdiEffect: 12, noiseSd: 1.0 });
    const out = estimateEffect(rows, "ResourceDiversityIndex", "FinalGrade", {
      bootstrapIters: 300,
      seed: 99,
    });
    // CI must bracket its own point estimate.
    expect(out.ciLow).toBeLessThanOrEqual(out.estimate);
    expect(out.ciHigh).toBeGreaterThanOrEqual(out.estimate);
    // CI low/high must sit within ±5 of the true effect (consistency check).
    expect(out.ciLow).toBeGreaterThan(7);
    expect(out.ciHigh).toBeLessThan(17);
    expect(out.method).toBe("backdoor_ols");
    expect(out.adjustmentSet).toEqual(["PriorGPA", "Engagement"]);
    expect(out.bootstrapIters).toBe(300);
    expect(out.ciLevel).toBe(0.95);
  });

  it("includes the standard limitations payload", () => {
    const rows = makeSyntheticRows({ noiseSd: 1.0 });
    const out = estimateEffect(rows, "ForumParticipation", "FinalGrade", {
      bootstrapIters: 100,
    });
    expect(out.limitations.length).toBeGreaterThan(0);
    expect(
      out.limitations.some((l) => l.toLowerCase().includes("model-based")),
    ).toBe(true);
  });

  it("throws when the sample is too small to fit", () => {
    const tiny = makeSyntheticRows({ n: 2 });
    expect(() =>
      estimateEffect(tiny, "ResourceDiversityIndex", "FinalGrade"),
    ).toThrow(/sample too small/);
  });
});
