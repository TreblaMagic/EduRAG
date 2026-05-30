import { describe, expect, it } from "vitest";

import { CAUSAL_NODES } from "../dag";
import { toFeatureRow, type RawFeatureSource } from "../feature-table";

const baseRaw: RawFeatureSource = {
  studentId: "S1",
  courseId: "C1",
  priorGpa: 3.2,
  meanEngagement: 0.72,
  meanRdi: 0.55,
  forumParticipation: 1.8,
  quizConsistency: 0.81,
  assessmentTrend: 0.12,
  finalGrade: 78.5,
};

describe("toFeatureRow", () => {
  it("maps every causal node into the features vector", () => {
    const row = toFeatureRow(baseRaw);
    for (const node of CAUSAL_NODES) {
      expect(row.features).toHaveProperty(node);
      expect(typeof row.features[node]).toBe("number");
    }
  });

  it("preserves the source identifiers", () => {
    const row = toFeatureRow(baseRaw);
    expect(row.studentId).toBe("S1");
    expect(row.courseId).toBe("C1");
  });

  it("renames meanEngagement → Engagement and meanRdi → ResourceDiversityIndex", () => {
    const row = toFeatureRow(baseRaw);
    expect(row.features.Engagement).toBe(baseRaw.meanEngagement);
    expect(row.features.ResourceDiversityIndex).toBe(baseRaw.meanRdi);
  });

  it("passes priorGpa, forumParticipation, quizConsistency, assessmentTrend, finalGrade through unchanged", () => {
    const row = toFeatureRow(baseRaw);
    expect(row.features.PriorGPA).toBe(baseRaw.priorGpa);
    expect(row.features.ForumParticipation).toBe(baseRaw.forumParticipation);
    expect(row.features.QuizConsistency).toBe(baseRaw.quizConsistency);
    expect(row.features.AssessmentTrend).toBe(baseRaw.assessmentTrend);
    expect(row.features.FinalGrade).toBe(baseRaw.finalGrade);
  });

  it("produces independent vectors so callers can mutate features safely", () => {
    const a = toFeatureRow(baseRaw);
    const b = toFeatureRow(baseRaw);
    a.features.Engagement = 0;
    expect(b.features.Engagement).toBe(baseRaw.meanEngagement);
  });
});
