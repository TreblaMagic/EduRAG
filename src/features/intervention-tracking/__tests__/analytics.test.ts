import { describe, expect, it } from "vitest";

import { computeAnalytics } from "../analytics";
import type { DecisionRow } from "../analytics";

const sample: ReadonlyArray<DecisionRow> = [
  {
    interventionName: "increase_resource_diversity",
    status: "accepted",
    treatment: "ResourceDiversityIndex",
    followUpObserved: true,
    followUpOutcome: "Engagement steady",
  },
  {
    interventionName: "increase_resource_diversity",
    status: "accepted",
    treatment: "ResourceDiversityIndex",
    followUpObserved: false,
    followUpOutcome: null,
  },
  {
    interventionName: "improve_quiz_consistency",
    status: "deferred",
    treatment: "QuizConsistency",
    followUpObserved: false,
    followUpOutcome: null,
  },
  {
    interventionName: "increase_forum_participation",
    status: "rejected",
    treatment: "ForumParticipation",
    followUpObserved: false,
    followUpOutcome: null,
  },
  {
    interventionName: "improve_quiz_consistency",
    status: "completed",
    treatment: "QuizConsistency",
    followUpObserved: true,
    followUpOutcome: "Quiz scores improved slightly",
  },
];

describe("computeAnalytics", () => {
  it("counts decisions by status", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    expect(out.decisionCounts.accepted).toBe(2);
    expect(out.decisionCounts.completed).toBe(1);
    expect(out.decisionCounts.deferred).toBe(1);
    expect(out.decisionCounts.rejected).toBe(1);
  });

  it("returns the count of recommendations still in 'proposed' state", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    expect(out.proposedCount).toBe(10 - sample.length);
  });

  it("identifies the most-accepted intervention", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    expect(out.mostAccepted?.interventionName).toBe("increase_resource_diversity");
    expect(out.mostAccepted?.count).toBe(2);
  });

  it("identifies the most-deferred intervention", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    expect(out.mostDeferred?.interventionName).toBe("improve_quiz_consistency");
    expect(out.mostDeferred?.count).toBe(1);
  });

  it("counts follow-ups recorded vs pending", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    expect(out.followUpsRecorded).toBe(2);
    // accepted + completed = 3; recorded = 2; pending = 1
    expect(out.followUpsPending).toBe(1);
  });

  it("emits insights that never use banned causal-validation language", () => {
    const out = computeAnalytics({ totalRecommendations: 10, decisions: sample });
    const blob = out.observationalInsights.join(" ").toLowerCase();
    for (const banned of [
      "guaranteed",
      "proven cause",
      "confirms causation",
      "scientific proof",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("returns a 'no decisions yet' insight when the decisions list is empty", () => {
    const out = computeAnalytics({ totalRecommendations: 0, decisions: [] });
    expect(out.observationalInsights.length).toBeGreaterThan(0);
    expect(out.observationalInsights[0]!.toLowerCase()).toContain("no advisor decisions");
  });

  it("survives a zero-row corpus without throwing", () => {
    const out = computeAnalytics({ totalRecommendations: 0, decisions: [] });
    expect(out.decisionCounts.accepted).toBe(0);
    expect(out.mostAccepted).toBe(null);
    expect(out.mostDeferred).toBe(null);
  });
});
