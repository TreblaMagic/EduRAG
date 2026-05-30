import { describe, expect, it } from "vitest";

import {
  ALL_MODES,
  DATASET_MODE_METADATA,
  isDatasetMode,
  metadataFor,
} from "../metadata";
import { DATASET_MODES } from "../types";

describe("DATASET_MODE_METADATA", () => {
  it("covers every DatasetMode", () => {
    for (const m of DATASET_MODES) {
      expect(DATASET_MODE_METADATA[m]).toBeDefined();
      expect(DATASET_MODE_METADATA[m].id).toBe(m);
    }
  });

  it("uses distinct accents per mode", () => {
    const accents = new Set(ALL_MODES.map((m) => m.accent));
    expect(accents.size).toBe(3);
  });

  it("provides a non-trivial description for every mode", () => {
    for (const m of ALL_MODES) {
      expect(m.description.length).toBeGreaterThan(40);
      expect(m.name.length).toBeGreaterThan(3);
      expect(m.tagline.length).toBeGreaterThan(3);
      expect(m.refreshHint.length).toBeGreaterThan(3);
    }
  });
});

describe("metadataFor", () => {
  it("returns the matching entry", () => {
    expect(metadataFor("synthetic").id).toBe("synthetic");
    expect(metadataFor("shell-university").id).toBe("shell-university");
    expect(metadataFor("uploaded").id).toBe("uploaded");
  });
});

describe("isDatasetMode", () => {
  it("accepts every supported mode", () => {
    for (const m of DATASET_MODES) expect(isDatasetMode(m)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isDatasetMode("random")).toBe(false);
    expect(isDatasetMode(null)).toBe(false);
    expect(isDatasetMode(undefined)).toBe(false);
    expect(isDatasetMode(42)).toBe(false);
    expect(isDatasetMode({ id: "synthetic" })).toBe(false);
    expect(isDatasetMode("")).toBe(false);
  });
});

describe("ALL_MODES ordering", () => {
  it("matches DATASET_MODES (canonical order)", () => {
    expect(ALL_MODES.map((m) => m.id)).toEqual([...DATASET_MODES]);
  });
});
