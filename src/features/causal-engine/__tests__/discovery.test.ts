import { describe, expect, it } from "vitest";

import { CAUSAL_NODES } from "../dag";
import { diffManualVsDiscovered, runDiscovery } from "../discovery";
import {
  conditionalIndependenceTest,
  partialCorrelation,
} from "../independence-tests";
import type { FeatureRow } from "../feature-table";
import { mulberry32 } from "../rng";

function syntheticChain(n = 400, seed = 11): FeatureRow[] {
  // Simple chain: X1 -> X2 -> X3 plus an independent X4.
  // Encoded into the EduRAG feature shape using the first four causal nodes.
  const rng = mulberry32(seed);
  const out: FeatureRow[] = [];
  for (let i = 0; i < n; i++) {
    const x1 = rng();
    const x2 = 0.8 * x1 + 0.3 * rng();
    const x3 = 0.8 * x2 + 0.3 * rng();
    const x4 = rng();
    out.push({
      studentId: `S${i}`,
      courseId: "C1",
      features: {
        PriorGPA: x1,
        Engagement: x2,
        ResourceDiversityIndex: x3,
        ForumParticipation: x4,
        QuizConsistency: 0,
        AssessmentTrend: 0,
        FinalGrade: 0,
      },
    });
  }
  return out;
}

describe("partialCorrelation + conditionalIndependenceTest", () => {
  it("returns the marginal Pearson when conditioning set is empty", () => {
    const rng = mulberry32(7);
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 100; i++) {
      const a = rng();
      x.push(a);
      y.push(2 * a + 0.1 * rng());
    }
    const rho = partialCorrelation(x, y, []);
    expect(rho).toBeGreaterThan(0.9);
  });

  it("drops near-zero once a chain mediator is conditioned out", () => {
    const rows = syntheticChain();
    const x1 = rows.map((r) => r.features.PriorGPA);
    const x2 = rows.map((r) => r.features.Engagement);
    const x3 = rows.map((r) => r.features.ResourceDiversityIndex);
    const marginal = conditionalIndependenceTest(x1, x3, []);
    const conditional = conditionalIndependenceTest(x1, x3, [x2]);
    expect(marginal.pValue).toBeLessThan(0.001);
    expect(conditional.pValue).toBeGreaterThan(marginal.pValue);
    expect(Math.abs(conditional.rho)).toBeLessThan(Math.abs(marginal.rho));
  });
});

describe("runDiscovery", () => {
  it("recovers no edge between unrelated nodes", () => {
    const rows = syntheticChain();
    const result = runDiscovery(rows, {
      nodes: ["PriorGPA", "ForumParticipation"],
      alpha: 0.05,
    });
    expect(result.edges.length).toBe(0);
  });

  it("recovers the X1 -- X2 -- X3 skeleton on the synthetic chain", () => {
    const rows = syntheticChain();
    const result = runDiscovery(rows, {
      nodes: ["PriorGPA", "Engagement", "ResourceDiversityIndex"],
      alpha: 0.05,
    });
    const present = (a: string, b: string) =>
      result.edges.some(
        (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
      );
    expect(present("PriorGPA", "Engagement")).toBe(true);
    expect(present("Engagement", "ResourceDiversityIndex")).toBe(true);
    // Mediator chain — direct edge should be eliminated by conditioning on Engagement.
    expect(present("PriorGPA", "ResourceDiversityIndex")).toBe(false);
  });

  it("warns on small samples", () => {
    const result = runDiscovery(syntheticChain(20), {
      nodes: ["PriorGPA", "Engagement"],
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns the algorithm metadata even when no edges remain", () => {
    const rng = mulberry32(2);
    const rows: FeatureRow[] = [];
    for (let i = 0; i < 60; i++) {
      rows.push({
        studentId: `S${i}`,
        courseId: "C1",
        features: {
          PriorGPA: rng(),
          Engagement: rng(),
          ResourceDiversityIndex: rng(),
          ForumParticipation: rng(),
          QuizConsistency: rng(),
          AssessmentTrend: rng(),
          FinalGrade: rng(),
        },
      });
    }
    const result = runDiscovery(rows, {
      nodes: ["QuizConsistency", "AssessmentTrend", "FinalGrade"],
    });
    expect(result.algorithm).toBe("pc_partial_correlation");
    expect(result.independenceTests).toBeGreaterThan(0);
  });
});

describe("diffManualVsDiscovered", () => {
  const manual = [
    { from: "PriorGPA", to: "Engagement" } as const,
    { from: "Engagement", to: "ResourceDiversityIndex" } as const,
    { from: "ResourceDiversityIndex", to: "FinalGrade" } as const,
  ];

  it("classifies shared, manual-only, and discovered-only edges", () => {
    const discovered = [
      { from: "PriorGPA" as const, to: "Engagement" as const, oriented: true }, // shared
      { from: "Engagement" as const, to: "ForumParticipation" as const, oriented: true }, // disc only
      // Engagement->RDI missing → manual only
      // RDI->FG missing → manual only
    ];
    const diff = diffManualVsDiscovered(manual, discovered);
    expect(diff.shared.map((s) => `${s.from}->${s.to}`)).toEqual(["PriorGPA->Engagement"]);
    expect(diff.manualOnly).toHaveLength(2);
    expect(diff.discoveredOnly).toHaveLength(1);
  });

  it("treats undirected discovered edges as overlapping in either direction", () => {
    const discovered = [
      { from: "Engagement" as const, to: "PriorGPA" as const, oriented: false },
    ];
    const diff = diffManualVsDiscovered(manual, discovered);
    expect(diff.shared.map((s) => `${s.from}->${s.to}`)).toEqual(["PriorGPA->Engagement"]);
    expect(diff.discoveredOnly).toHaveLength(0);
  });

  it("exercises the full causal node set without throwing", () => {
    const rows = syntheticChain();
    const result = runDiscovery(rows, { nodes: CAUSAL_NODES });
    const diff = diffManualVsDiscovered(
      [{ from: "PriorGPA", to: "Engagement" }],
      result.edges,
    );
    expect(diff).toHaveProperty("shared");
    expect(diff).toHaveProperty("manualOnly");
    expect(diff).toHaveProperty("discoveredOnly");
  });
});
