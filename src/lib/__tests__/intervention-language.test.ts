import { describe, expect, it } from "vitest";

import {
  HONESTY_DISCLAIMER,
  ciSpansZero,
  featureLabel,
  interventionLabel,
  projectionHeadline,
} from "../intervention-language";

describe("interventionLabel", () => {
  it("returns the human label for known catalogue items", () => {
    expect(interventionLabel("increase_resource_diversity")).toBe(
      "Increase Resource Diversity",
    );
    expect(interventionLabel("improve_quiz_consistency")).toBe(
      "Improve Quiz Consistency",
    );
  });

  it("title-cases unknown snake_case names", () => {
    expect(interventionLabel("foo_bar_baz")).toBe("Foo Bar Baz");
  });
});

describe("featureLabel", () => {
  it("returns the human label for every DAG node", () => {
    expect(featureLabel("ResourceDiversityIndex")).toBe("Resource Diversity Index");
    expect(featureLabel("ForumParticipation")).toBe("Forum Participation");
    expect(featureLabel("FinalGrade")).toBe("Final Grade");
  });
});

describe("projectionHeadline", () => {
  it("formats a positive gain with a leading +", () => {
    expect(projectionHeadline({ baselineGrade: 65, projectedGrade: 66.5 })).toBe(
      "+1.50 grade points",
    );
  });

  it("preserves the minus sign on negative gain", () => {
    expect(projectionHeadline({ baselineGrade: 65, projectedGrade: 63.2 })).toBe(
      "-1.80 grade points",
    );
  });
});

describe("ciSpansZero", () => {
  it("returns true when the projection range brackets baseline", () => {
    expect(
      ciSpansZero({ baselineGrade: 65, projectedLow: 64, projectedHigh: 67 }),
    ).toBe(true);
  });

  it("returns false when both bounds sit above baseline", () => {
    expect(
      ciSpansZero({ baselineGrade: 65, projectedLow: 65.5, projectedHigh: 67 }),
    ).toBe(false);
  });

  it("returns false when both bounds sit below baseline", () => {
    expect(
      ciSpansZero({ baselineGrade: 65, projectedLow: 60, projectedHigh: 64 }),
    ).toBe(false);
  });
});

describe("HONESTY_DISCLAIMER", () => {
  it("includes the required 'model-based' and 'cohort-average' phrases", () => {
    expect(HONESTY_DISCLAIMER.toLowerCase()).toContain("model-based");
    expect(HONESTY_DISCLAIMER.toLowerCase()).toContain("cohort-average");
  });

  it("does not contain forbidden overclaim phrases", () => {
    const FORBIDDEN = ["guaranteed", "proven", "definitely", "will improve"];
    for (const phrase of FORBIDDEN) {
      expect(HONESTY_DISCLAIMER.toLowerCase()).not.toContain(phrase);
    }
  });
});
