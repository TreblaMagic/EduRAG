import { describe, expect, it } from "vitest";

import {
  buildUsageFromDurations,
  computeRdi,
  RESOURCE_TYPES,
  TOTAL_RESOURCE_TYPES,
} from "../rdi";

describe("computeRdi", () => {
  it("returns zero on an empty usage map", () => {
    expect(computeRdi({})).toEqual({ value: 0, observedTypes: 0, totalWeight: 0 });
  });

  it("treats zero-weight entries as absent", () => {
    expect(computeRdi({ VIDEO: 0, READING: 0 })).toEqual({
      value: 0,
      observedTypes: 0,
      totalWeight: 0,
    });
  });

  it("returns zero when activity is concentrated on a single type", () => {
    const result = computeRdi({ VIDEO: 600 });
    expect(result.value).toBe(0);
    expect(result.observedTypes).toBe(1);
    expect(result.totalWeight).toBe(600);
  });

  it("returns 1 when all catalogue types are used evenly", () => {
    const even = Object.fromEntries(RESOURCE_TYPES.map((t) => [t, 100]));
    const result = computeRdi(even);
    expect(result.value).toBeCloseTo(1, 10);
    expect(result.observedTypes).toBe(TOTAL_RESOURCE_TYPES);
  });

  it("normalises by the full catalogue, so 2 of 5 types is < 1", () => {
    const result = computeRdi({ VIDEO: 100, READING: 100 });
    // Expected: log2(2) / log2(5) ≈ 0.4307
    expect(result.value).toBeCloseTo(Math.log2(2) / Math.log2(5), 6);
    expect(result.observedTypes).toBe(2);
  });

  it("scores a lopsided distribution lower than an even one", () => {
    const even = computeRdi({ VIDEO: 100, READING: 100, QUIZ: 100, FORUM: 100, LAB: 100 });
    const lopsided = computeRdi({ VIDEO: 900, READING: 25, QUIZ: 25, FORUM: 25, LAB: 25 });
    expect(lopsided.value).toBeLessThan(even.value);
    expect(lopsided.value).toBeGreaterThan(0);
  });

  it("ignores zero-weight types when computing observedTypes", () => {
    const a = computeRdi({ VIDEO: 100, READING: 100 });
    const b = computeRdi({ VIDEO: 100, READING: 100, QUIZ: 0 });
    expect(a.value).toBeCloseTo(b.value, 10);
    expect(a.observedTypes).toBe(b.observedTypes);
  });

  it("clamps to [0, 1] under numerical drift", () => {
    const tiny = computeRdi({ VIDEO: 1e-300, READING: 1e-300 });
    expect(tiny.value).toBeGreaterThanOrEqual(0);
    expect(tiny.value).toBeLessThanOrEqual(1);
  });

  it("throws when the catalogue size is below 2", () => {
    expect(() => computeRdi({ VIDEO: 1 }, 1)).toThrow(RangeError);
  });

  it("scales with the totalCatalogueTypes parameter", () => {
    // Same usage, two different catalogues: smaller catalogue → higher RDI.
    const usage = { VIDEO: 100, READING: 100 };
    const inCatalogue5 = computeRdi(usage, 5).value;
    const inCatalogue2 = computeRdi(usage, 2).value;
    expect(inCatalogue2).toBeGreaterThan(inCatalogue5);
    expect(inCatalogue2).toBeCloseTo(1, 10);
  });
});

describe("buildUsageFromDurations", () => {
  it("sums durations by resource type", () => {
    const usage = buildUsageFromDurations([
      { resourceType: "VIDEO", durationSeconds: 100 },
      { resourceType: "VIDEO", durationSeconds: 50 },
      { resourceType: "QUIZ", durationSeconds: 200 },
    ]);
    expect(usage).toEqual({ VIDEO: 150, QUIZ: 200 });
  });

  it("returns an empty map for no events", () => {
    expect(buildUsageFromDurations([])).toEqual({});
  });
});
