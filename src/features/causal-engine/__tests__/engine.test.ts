import { describe, expect, it } from "vitest";

import { adjustmentSetFor, type CausalNode } from "../dag";
import { baselineEngine, selectEngine } from "../engine";
import type { FeatureRow } from "../feature-table";
import { mulberry32 } from "../rng";

function makeRows(n = 500, seed = 1): FeatureRow[] {
  const rng = mulberry32(seed);
  const rows: FeatureRow[] = [];
  for (let i = 0; i < n; i++) {
    const priorGpa = 1 + rng() * 3;
    const engagement = Math.max(0, Math.min(1, 0.1 + rng() * 0.8));
    const rdi = Math.max(0, Math.min(1, 0.1 + 0.2 * engagement + 0.6 * rng()));
    const forum = 0.3 * engagement + rng() * 1.0;
    const quiz = Math.max(0, Math.min(1, 0.3 + rng() * 0.6));
    const trend = -0.2 + rng() * 0.8;
    const noise = boxMuller(rng) * 1.0;
    const grade =
      50 + 6 * priorGpa + 10 * engagement + 12 * rdi + 4 * forum + 8 * quiz + 6 * trend + noise;
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

function boxMuller(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe("baselineEngine", () => {
  it("is always available", async () => {
    expect(await baselineEngine.available()).toBe(true);
  });

  it("returns a CausalEngine-compatible estimate payload", async () => {
    const rows = makeRows();
    const treatment: CausalNode = "ResourceDiversityIndex";
    const out = await baselineEngine.estimate({
      treatment,
      outcome: "FinalGrade",
      adjustmentSet: adjustmentSetFor(treatment),
      rows,
      bootstrapIters: 300,
      seed: 99,
    });
    expect(out.engine).toBe("baseline");
    expect(out.method).toBe("backdoor_ols");
    expect(out.treatment).toBe(treatment);
    expect(out.ciLow).toBeLessThanOrEqual(out.estimate);
    expect(out.ciHigh).toBeGreaterThanOrEqual(out.estimate);
    expect(out.notes.length).toBeGreaterThan(0);
    expect(out.warnings).toEqual([]);
  });

  it("exposes discovery via the optional method", async () => {
    const rows = makeRows(200, 9);
    expect(baselineEngine.discover).toBeDefined();
    const result = await baselineEngine.discover!({
      rows,
      nodes: ["PriorGPA", "Engagement", "ResourceDiversityIndex", "FinalGrade"],
      alpha: 0.05,
    });
    expect(result.engine).toBe("baseline");
    expect(result.algorithm).toBe("pc_partial_correlation");
    expect(Array.isArray(result.edges)).toBe(true);
  });
});

describe("selectEngine", () => {
  it("returns baseline when baseline is requested (no warnings)", async () => {
    const sel = await selectEngine("baseline");
    expect(sel.resolvedName).toBe("baseline");
    expect(sel.warnings).toEqual([]);
    expect(sel.engine.name).toBe("baseline");
  });

  it(
    "falls back to baseline with a warning when the Python worker is unavailable",
    async () => {
      // Tests run with no Python worker reachable in CI / local non-Python envs.
      // The Python probe + ping can be slow on a cold box, so we give the
      // assertion a generous timeout to avoid flaky CI failures.
      const sel = await selectEngine("advanced");
      if (sel.resolvedName === "advanced") {
        // Python is actually installed on this machine; the fallback path isn't
        // exercised. Still confirm the contract.
        expect(sel.warnings).toEqual([]);
      } else {
        expect(sel.resolvedName).toBe("baseline");
        expect(sel.requestedName).toBe("advanced");
        expect(sel.warnings.length).toBeGreaterThan(0);
        expect(sel.warnings[0]).toMatch(/advanced.*unavailable/i);
      }
    },
    15_000,
  );
});
