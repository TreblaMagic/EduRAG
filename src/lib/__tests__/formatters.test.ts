import { describe, expect, it } from "vitest";

import {
  formatDecimal,
  formatDelta,
  formatGrade,
  formatNumber,
  formatPercent,
  formatRange,
} from "../formatters";

describe("formatGrade", () => {
  it("formats a finite number to the requested precision", () => {
    expect(formatGrade(73.456)).toBe("73.5");
    expect(formatGrade(73.456, 2)).toBe("73.46");
  });

  it("returns the em-dash for non-finite values", () => {
    expect(formatGrade(Number.NaN)).toBe("—");
    expect(formatGrade(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("prefixes a plus sign for non-negative values", () => {
    expect(formatDelta(1.27)).toBe("+1.27");
    expect(formatDelta(0)).toBe("+0.00");
  });

  it("preserves the minus sign for negative values", () => {
    expect(formatDelta(-0.5)).toBe("-0.50");
  });

  it("returns em-dash for non-finite values", () => {
    expect(formatDelta(Number.NaN)).toBe("—");
  });
});

describe("formatRange", () => {
  it("formats two deltas separated by 'to'", () => {
    expect(formatRange(-0.2, 2.74)).toBe("-0.20 to +2.74");
  });

  it("handles a non-finite bound", () => {
    expect(formatRange(Number.NaN, 1)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("multiplies by 100 and appends %", () => {
    expect(formatPercent(0.58)).toBe("58%");
    expect(formatPercent(0.581, 1)).toBe("58.1%");
  });
});

describe("formatNumber", () => {
  it("uses US locale grouping for integers", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("formatDecimal", () => {
  it("formats to two decimals by default", () => {
    expect(formatDecimal(0.500001)).toBe("0.50");
  });
});
