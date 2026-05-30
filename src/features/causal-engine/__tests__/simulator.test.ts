import { describe, expect, it } from "vitest";

import type { CausalNode } from "../dag";
import type { FeatureRow } from "../feature-table";
import {
  STANDARD_INTERVENTIONS,
  computeCohortStats,
  rankRecommendedInterventions,
  simulateIntervention,
  simulateMultipleInterventions,
  type CausalEstimateSummary,
  type CohortStats,
  type InterventionProposal,
} from "../simulator";

// ---- fixtures --------------------------------------------------------------

function makeRow(
  overrides: Partial<FeatureRow["features"]> = {},
  id = "S1",
): FeatureRow {
  return {
    studentId: id,
    courseId: "C1",
    features: {
      PriorGPA: 3.0,
      Engagement: 0.6,
      ResourceDiversityIndex: 0.5,
      ForumParticipation: 1.5,
      QuizConsistency: 0.7,
      AssessmentTrend: 0.1,
      FinalGrade: 70.0,
      ...overrides,
    },
  };
}

const fixedStats: CohortStats = {
  mean: {
    PriorGPA: 3.0,
    Engagement: 0.6,
    ResourceDiversityIndex: 0.5,
    ForumParticipation: 1.5,
    QuizConsistency: 0.7,
    AssessmentTrend: 0.1,
    FinalGrade: 70.0,
  },
  stdev: {
    PriorGPA: 0.5,
    Engagement: 0.15,
    ResourceDiversityIndex: 0.2,
    ForumParticipation: 1.0,
    QuizConsistency: 0.15,
    AssessmentTrend: 0.1,
    FinalGrade: 12.0,
  },
  min: {},
  max: {},
  size: 100,
};

const rdiEstimate: CausalEstimateSummary = {
  treatment: "ResourceDiversityIndex",
  outcome: "FinalGrade",
  estimate: 10.0,
  ciLow: 6.0,
  ciHigh: 14.0,
  refutationPassesAll: true,
  refutationPassesAny: true,
};

const rdiProposal = STANDARD_INTERVENTIONS.find(
  (i) => i.name === "increase_resource_diversity",
) as InterventionProposal;

// ---- delta application -----------------------------------------------------

describe("simulateIntervention — delta application", () => {
  it("applies β · delta to baseline grade", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3, FinalGrade: 65 });
    const sim = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    // delta = 0.15 (≤ headroom of (0.5+2*0.2) - 0.3 = 0.6), β = 10 → +1.5
    expect(sim.baselineValue).toBe(0.3);
    expect(sim.proposedValue).toBeCloseTo(0.45, 4);
    expect(sim.appliedDelta).toBeCloseTo(0.15, 4);
    expect(sim.estimatedEffect).toBe(10);
    expect(sim.baselineGrade).toBe(65);
    expect(sim.projectedGrade).toBeCloseTo(66.5, 4);
  });

  it("includes the intervention name and treatment in the result", () => {
    const sim = simulateIntervention(makeRow(), rdiProposal, rdiEstimate, fixedStats);
    expect(sim.interventionName).toBe(rdiProposal.name);
    expect(sim.treatment).toBe("ResourceDiversityIndex");
  });

  it("throws when estimate.treatment ≠ intervention.treatment", () => {
    const wrong: CausalEstimateSummary = { ...rdiEstimate, treatment: "ForumParticipation" };
    expect(() =>
      simulateIntervention(makeRow(), rdiProposal, wrong, fixedStats),
    ).toThrow(/does not match/);
  });
});

// ---- clamping --------------------------------------------------------------

describe("simulateIntervention — clamping", () => {
  it("clamps projected grade to [0, 100] when β·delta would exceed 100", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3, FinalGrade: 99 });
    const huge: CausalEstimateSummary = { ...rdiEstimate, estimate: 200, ciLow: 100, ciHigh: 300 };
    const sim = simulateIntervention(row, rdiProposal, huge, fixedStats);
    expect(sim.projectedGrade).toBeLessThanOrEqual(100);
    expect(sim.projectedHigh).toBeLessThanOrEqual(100);
  });

  it("clamps projected grade to [0, 100] when β·delta would go below 0", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3, FinalGrade: 5 });
    const verynegative: CausalEstimateSummary = {
      ...rdiEstimate,
      estimate: -200,
      ciLow: -300,
      ciHigh: -100,
    };
    const sim = simulateIntervention(row, rdiProposal, verynegative, fixedStats);
    expect(sim.projectedGrade).toBeGreaterThanOrEqual(0);
    expect(sim.projectedLow).toBeGreaterThanOrEqual(0);
  });
});

// ---- headroom --------------------------------------------------------------

describe("simulateIntervention — headroom", () => {
  it("clamps applied delta when student is near the theoretical max (RDI ≤ 1)", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.95 });
    const sim = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    expect(sim.proposedValue).toBeLessThanOrEqual(1.0);
    expect(sim.appliedDelta).toBeLessThan(rdiProposal.delta);
    expect(sim.appliedDelta).toBeGreaterThanOrEqual(0);
  });

  it("clamps applied delta when student is already above the cohort ceiling", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.95 }); // cohort ceiling = 0.5+2*0.2 = 0.9
    const sim = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    expect(sim.headroom).toBe(0);
    expect(sim.appliedDelta).toBe(0);
    expect(sim.projectedGrade).toBe(sim.baselineGrade);
  });
});

// ---- CI propagation --------------------------------------------------------

describe("simulateIntervention — CI propagation", () => {
  it("uses ciLow and ciHigh times applied delta to compute the projection range", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3, FinalGrade: 65 });
    const sim = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    // appliedDelta = 0.15; ciLow=6 → +0.9; ciHigh=14 → +2.1
    expect(sim.projectedLow).toBeCloseTo(65.9, 4);
    expect(sim.projectedHigh).toBeCloseTo(67.1, 4);
  });

  it("orders projectedLow ≤ projectedGrade ≤ projectedHigh even when β is negative", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3, FinalGrade: 65 });
    const neg: CausalEstimateSummary = {
      ...rdiEstimate,
      estimate: -10,
      ciLow: -14,
      ciHigh: -6,
    };
    const sim = simulateIntervention(row, rdiProposal, neg, fixedStats);
    expect(sim.projectedLow).toBeLessThanOrEqual(sim.projectedGrade);
    expect(sim.projectedGrade).toBeLessThanOrEqual(sim.projectedHigh);
  });
});

// ---- explanation language (honesty contract) ------------------------------

describe("simulateIntervention — explanation language", () => {
  const FORBIDDEN = [
    "guaranteed",
    "guarantee", // also catches "guarantees"
    "proven",
    "definitely",
    "will improve",
    "will increase",
  ];
  const REQUIRED = [
    "model-based",
    "cohort-average",
    "estimated improvement range",
  ];

  it("never contains forbidden overclaim phrases", () => {
    for (const intervention of STANDARD_INTERVENTIONS) {
      const fakeEstimate: CausalEstimateSummary = {
        treatment: intervention.treatment,
        outcome: "FinalGrade",
        estimate: 5,
        ciLow: 2,
        ciHigh: 8,
        refutationPassesAll: true,
        refutationPassesAny: true,
      };
      const sim = simulateIntervention(makeRow(), intervention, fakeEstimate, fixedStats);
      for (const phrase of FORBIDDEN) {
        expect(
          sim.explanation.toLowerCase(),
          `intervention=${intervention.name} contained "${phrase}"`,
        ).not.toContain(phrase);
      }
    }
  });

  it("contains the required honesty phrases by default", () => {
    const sim = simulateIntervention(makeRow(), rdiProposal, rdiEstimate, fixedStats);
    for (const phrase of REQUIRED) {
      expect(sim.explanation.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("notes when the CI spans zero (cannot rule out no effect)", () => {
    const span: CausalEstimateSummary = {
      ...rdiEstimate,
      estimate: 1,
      ciLow: -3,
      ciHigh: 5,
    };
    const sim = simulateIntervention(makeRow(), rdiProposal, span, fixedStats);
    expect(sim.explanation.toLowerCase()).toContain("cannot rule out");
  });

  it("notes when confidence is low (refutation checks failed)", () => {
    const lowConf: CausalEstimateSummary = {
      ...rdiEstimate,
      refutationPassesAll: false,
      refutationPassesAny: false,
    };
    const sim = simulateIntervention(makeRow(), rdiProposal, lowConf, fixedStats);
    expect(sim.confidence).toBe("low");
    expect(sim.explanation.toLowerCase()).toContain("low");
  });

  it("notes when the requested delta was clamped by headroom", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.85 }); // cohort ceiling = 0.9
    const sim = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    expect(sim.appliedDelta).toBeLessThan(rdiProposal.delta);
    expect(sim.explanation.toLowerCase()).toContain("headroom");
  });
});

// ---- ranking ---------------------------------------------------------------

describe("rankRecommendedInterventions", () => {
  function estimatesForAll(beta: number): ReadonlyMap<CausalNode, CausalEstimateSummary> {
    const m = new Map<CausalNode, CausalEstimateSummary>();
    for (const i of STANDARD_INTERVENTIONS) {
      m.set(i.treatment, {
        treatment: i.treatment,
        outcome: "FinalGrade",
        estimate: beta,
        ciLow: beta - 1,
        ciHigh: beta + 1,
        refutationPassesAll: true,
        refutationPassesAny: true,
      });
    }
    return m;
  }

  it("orders by rankScore descending (sorted top-down)", () => {
    const row = makeRow();
    const m = new Map<CausalNode, CausalEstimateSummary>([
      // RDI: β=10, delta=0.15 → projected gain ≈ 1.5
      [
        "ResourceDiversityIndex",
        {
          treatment: "ResourceDiversityIndex",
          outcome: "FinalGrade",
          estimate: 10,
          ciLow: 6,
          ciHigh: 14,
          refutationPassesAll: true,
          refutationPassesAny: true,
        },
      ],
      // Forum: β=0.1, delta=3.0 → projected gain ≈ 0.3
      [
        "ForumParticipation",
        {
          treatment: "ForumParticipation",
          outcome: "FinalGrade",
          estimate: 0.1,
          ciLow: 0,
          ciHigh: 0.2,
          refutationPassesAll: true,
          refutationPassesAny: true,
        },
      ],
    ]);
    const sims = simulateMultipleInterventions(
      row,
      STANDARD_INTERVENTIONS.slice(0, 2),
      m,
      fixedStats,
    );
    const ranked = rankRecommendedInterventions(sims);
    expect(ranked[0]!.treatment).toBe("ResourceDiversityIndex");
    // Asserted property of the function regardless of fixture choices:
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.rankScore).toBeGreaterThanOrEqual(ranked[i]!.rankScore);
    }
  });

  it("truncates to top-N when requested", () => {
    const sims = simulateMultipleInterventions(
      makeRow(),
      STANDARD_INTERVENTIONS,
      estimatesForAll(5),
      fixedStats,
    );
    const ranked = rankRecommendedInterventions(sims, 2);
    expect(ranked).toHaveLength(2);
  });

  it("returns the full list when topN is omitted", () => {
    const sims = simulateMultipleInterventions(
      makeRow(),
      STANDARD_INTERVENTIONS,
      estimatesForAll(5),
      fixedStats,
    );
    expect(rankRecommendedInterventions(sims)).toHaveLength(sims.length);
  });
});

describe("rank — weakness bonus", () => {
  it("a weaker student (below cohort mean) outranks a stronger one for the same intervention", () => {
    const weak = makeRow({ ResourceDiversityIndex: 0.2 });
    const strong = makeRow({ ResourceDiversityIndex: 0.7 });
    const weakSim = simulateIntervention(weak, rdiProposal, rdiEstimate, fixedStats);
    const strongSim = simulateIntervention(strong, rdiProposal, rdiEstimate, fixedStats);
    expect(weakSim.rankScore).toBeGreaterThan(strongSim.rankScore);
  });
});

describe("rank — confidence weight", () => {
  it("low-confidence estimates yield lower rankScore than high-confidence", () => {
    const row = makeRow({ ResourceDiversityIndex: 0.3 });
    const high = simulateIntervention(row, rdiProposal, rdiEstimate, fixedStats);
    const lowConf: CausalEstimateSummary = {
      ...rdiEstimate,
      refutationPassesAll: false,
      refutationPassesAny: false,
    };
    const low = simulateIntervention(row, rdiProposal, lowConf, fixedStats);
    expect(high.rankScore).toBeGreaterThan(low.rankScore);
  });
});

// ---- simulateMultipleInterventions ----------------------------------------

describe("simulateMultipleInterventions", () => {
  it("skips interventions without a matching causal estimate", () => {
    const m = new Map<CausalNode, CausalEstimateSummary>([
      ["ResourceDiversityIndex", rdiEstimate],
    ]);
    const sims = simulateMultipleInterventions(
      makeRow(),
      STANDARD_INTERVENTIONS,
      m,
      fixedStats,
    );
    expect(sims).toHaveLength(1);
    expect(sims[0]!.treatment).toBe("ResourceDiversityIndex");
  });
});

// ---- computeCohortStats ----------------------------------------------------

describe("computeCohortStats", () => {
  it("computes the per-feature mean and stdev", () => {
    const rows = [
      makeRow({ ResourceDiversityIndex: 0.4 }, "A"),
      makeRow({ ResourceDiversityIndex: 0.6 }, "B"),
    ];
    const stats = computeCohortStats(rows);
    expect(stats.mean.ResourceDiversityIndex).toBeCloseTo(0.5, 4);
    expect(stats.stdev.ResourceDiversityIndex).toBeCloseTo(0.1, 4);
    expect(stats.size).toBe(2);
  });

  it("returns zeros on an empty cohort", () => {
    const stats = computeCohortStats([]);
    expect(stats.size).toBe(0);
    expect(stats.mean.FinalGrade).toBe(0);
    expect(stats.stdev.FinalGrade).toBe(0);
  });
});
