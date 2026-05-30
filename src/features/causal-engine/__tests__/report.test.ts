import { describe, expect, it } from "vitest";

import { toDagJson } from "../dag";
import { renderJsonReport, renderMarkdownReport } from "../report";
import type { CausalReport } from "../report/types";

function makeReport(overrides: Partial<CausalReport> = {}): CausalReport {
  return {
    generatedAt: "2026-05-27T10:00:00.000Z",
    generator: "EduRAG",
    schemaVersion: "phase-7.v1",
    engine: "baseline",
    cohort: {
      courseCode: "CS-201",
      sampleSize: 248,
      outcome: "FinalGrade",
      meanOutcome: 75.3,
      stdOutcome: 9.1,
    },
    dag: toDagJson(),
    estimates: [
      {
        treatment: "ResourceDiversityIndex",
        adjustmentSet: ["PriorGPA", "Engagement"],
        estimate: 12.4,
        ciLow: 9.1,
        ciHigh: 15.7,
        ciLevel: 0.95,
        method: "backdoor_ols",
        engine: "baseline",
        bootstrapIters: 500,
        refutations: {
          placebo: {
            description: "",
            originalEstimate: 12.4,
            placeboEstimate: 0.1,
            ratio: 0.01,
            threshold: 0.3,
            passes: true,
          },
          randomCommonCause: {
            description: "",
            originalEstimate: 12.4,
            adjustedEstimate: 12.3,
            absChange: 0.1,
            relativeChange: 0.008,
            threshold: 0.25,
            passes: true,
          },
        },
        extendedRefutations: null,
        confidence: "high",
        warnings: [],
      },
    ],
    discovery: null,
    prediction: null,
    tracking: null,
    datasetMode: null,
    limitations: ["model-based estimate, not causal proof."],
    warnings: [],
    ...overrides,
  };
}

describe("renderMarkdownReport", () => {
  it("includes the cohort, estimates, refutations, and DAG sections", () => {
    const md = renderMarkdownReport(makeReport());
    expect(md).toContain("# Causal report — CS-201");
    expect(md).toContain("## 1. Cohort summary");
    expect(md).toContain("## 2. Estimated effects");
    expect(md).toContain("## 3. Refutation results");
    expect(md).toContain("## 4. DAG snapshot (manually encoded)");
    expect(md).toContain("ResourceDiversityIndex");
    expect(md).toContain("[9.100, 15.700]");
  });

  it("emits the experimental notice when discovery is included", () => {
    const md = renderMarkdownReport(
      makeReport({
        discovery: {
          algorithm: "pc_partial_correlation",
          alpha: 0.05,
          edges: [],
          manualOnly: [],
          discoveredOnly: [],
          shared: [],
          warnings: [],
          engine: "baseline",
        },
      }),
    );
    expect(md).toContain("## 5. Discovered DAG (experimental)");
    expect(md).toContain("statistical inference experiment");
  });

  it("does not use overclaiming causal language", () => {
    const md = renderMarkdownReport(makeReport()).toLowerCase();
    for (const banned of ["guaranteed", "proven cause", "will definitely improve"]) {
      expect(md).not.toContain(banned);
    }
  });
});

describe("renderJsonReport", () => {
  it("produces valid JSON matching the source object", () => {
    const report = makeReport();
    const json = renderJsonReport(report);
    const parsed = JSON.parse(json) as CausalReport;
    expect(parsed.cohort.courseCode).toBe("CS-201");
    expect(parsed.schemaVersion).toBe("phase-7.v1");
    expect(parsed.estimates).toHaveLength(1);
    expect(parsed.estimates[0]?.engine).toBe("baseline");
  });
});
