import { describe, expect, it } from "vitest";

import {
  confidenceMetaFor,
  riskLevelFor,
  riskMetaFor,
} from "../confidence-label";

describe("confidenceMetaFor", () => {
  it("returns 'High confidence' meta for `high`", () => {
    const meta = confidenceMetaFor("high");
    expect(meta.label).toBe("High confidence");
    expect(meta.badgeClasses).toContain("emerald");
  });

  it("returns 'Medium confidence' meta for `medium`", () => {
    const meta = confidenceMetaFor("medium");
    expect(meta.label).toBe("Medium confidence");
    expect(meta.badgeClasses).toContain("amber");
  });

  it("returns 'Low confidence' meta for `low`", () => {
    const meta = confidenceMetaFor("low");
    expect(meta.label).toBe("Low confidence");
    expect(meta.badgeClasses).toContain("rose");
  });

  it("provides a non-empty hint for every level", () => {
    for (const level of ["high", "medium", "low"] as const) {
      expect(confidenceMetaFor(level).hint.length).toBeGreaterThan(0);
    }
  });
});

describe("riskLevelFor", () => {
  it("classifies < 55 as at-risk", () => {
    expect(riskLevelFor(0)).toBe("at-risk");
    expect(riskLevelFor(54.9)).toBe("at-risk");
  });

  it("classifies [55, 70) as borderline", () => {
    expect(riskLevelFor(55)).toBe("borderline");
    expect(riskLevelFor(69.99)).toBe("borderline");
  });

  it("classifies ≥ 70 as on-track", () => {
    expect(riskLevelFor(70)).toBe("on-track");
    expect(riskLevelFor(99)).toBe("on-track");
  });

  it("treats non-finite as at-risk (defensive)", () => {
    expect(riskLevelFor(Number.NaN)).toBe("at-risk");
  });
});

describe("riskMetaFor", () => {
  it("returns labelled meta for each tier", () => {
    expect(riskMetaFor(30).label).toBe("At risk");
    expect(riskMetaFor(60).label).toBe("Borderline");
    expect(riskMetaFor(85).label).toBe("On track");
  });
});
