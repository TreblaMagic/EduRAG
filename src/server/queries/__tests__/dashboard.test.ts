import { describe, expect, it } from "vitest";

import { computeRiskCount, pickStrongestDriver } from "../dashboard";

describe("computeRiskCount", () => {
  it("counts grades strictly below the default threshold (55)", () => {
    expect(computeRiskCount([20, 50, 54.99, 55, 60, 90])).toBe(3);
  });

  it("respects a custom threshold", () => {
    expect(computeRiskCount([40, 60, 80], 70)).toBe(2);
  });

  it("ignores non-finite values defensively", () => {
    expect(computeRiskCount([Number.NaN, 30, 80])).toBe(1);
  });

  it("returns 0 on an empty cohort", () => {
    expect(computeRiskCount([])).toBe(0);
  });
});

describe("pickStrongestDriver", () => {
  it("returns null when no estimates are passed", () => {
    expect(pickStrongestDriver([])).toBeNull();
  });

  it("prefers the largest |β| among non-low confidence estimates", () => {
    const both = JSON.stringify({
      placebo: { passes: true },
      randomCommonCause: { passes: true },
    });
    const one = JSON.stringify({
      placebo: { passes: true },
      randomCommonCause: { passes: false },
    });
    const result = pickStrongestDriver([
      { treatment: "ForumParticipation", estimate: 2, refutationJson: both },
      { treatment: "ResourceDiversityIndex", estimate: 10, refutationJson: one },
      { treatment: "QuizConsistency", estimate: -50, refutationJson: null }, // low conf — ignored unless fallback
    ]);
    expect(result?.treatment).toBe("ResourceDiversityIndex");
    expect(result?.confidence).toBe("medium");
  });

  it("falls back to the strongest low-confidence estimate so the dashboard is never blank", () => {
    const result = pickStrongestDriver([
      { treatment: "ForumParticipation", estimate: 1.2, refutationJson: null },
      { treatment: "QuizConsistency", estimate: -3.4, refutationJson: null },
    ]);
    expect(result?.treatment).toBe("QuizConsistency");
    expect(result?.confidence).toBe("low");
  });
});
