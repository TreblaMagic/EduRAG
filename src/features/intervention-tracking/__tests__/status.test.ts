import { describe, expect, it } from "vitest";

import {
  BANNED_PHRASES,
  canTransition,
  containsBannedLanguage,
  STATUS_BADGE_CLASSES,
  STATUS_HINT,
  STATUS_LABEL,
  STATUS_VERB,
} from "../status";
import { DECISION_STATUSES, PERSISTED_STATUSES } from "../types";

describe("STATUS_LABEL + STATUS_HINT + STATUS_BADGE_CLASSES + STATUS_VERB", () => {
  it("covers every DecisionStatus", () => {
    for (const s of DECISION_STATUSES) {
      expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
      expect(STATUS_HINT[s].length).toBeGreaterThan(10);
      expect(STATUS_BADGE_CLASSES[s].length).toBeGreaterThan(0);
      expect(STATUS_VERB[s].length).toBeGreaterThan(0);
    }
  });
});

describe("canTransition", () => {
  it("returns false when from === to (no self-transitions)", () => {
    for (const s of DECISION_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("forbids transitions to 'proposed' (use clearDecision instead)", () => {
    for (const s of PERSISTED_STATUSES) {
      expect(canTransition(s, "proposed")).toBe(false);
    }
  });

  it("allows any other transition between persisted statuses", () => {
    expect(canTransition("accepted", "rejected")).toBe(true);
    expect(canTransition("deferred", "completed")).toBe(true);
    expect(canTransition("proposed", "accepted")).toBe(true);
  });
});

describe("containsBannedLanguage", () => {
  it("returns the banned phrase when present (case-insensitive)", () => {
    expect(containsBannedLanguage("This is guaranteed to work")).toBe("guaranteed");
    expect(containsBannedLanguage("Proves causation in this case")).toBe(null);
    expect(containsBannedLanguage("This confirms causation absolutely")).toBe(
      "confirms causation",
    );
    expect(containsBannedLanguage("Scientific Proof here")).toBe("scientific proof");
  });

  it("returns null for null / empty / safe text", () => {
    expect(containsBannedLanguage(null)).toBe(null);
    expect(containsBannedLanguage("")).toBe(null);
    expect(containsBannedLanguage("   ")).toBe(null);
    expect(containsBannedLanguage("Student agreed to try the new schedule.")).toBe(
      null,
    );
  });

  it("BANNED_PHRASES contains the four expected entries", () => {
    expect(BANNED_PHRASES).toContain("guaranteed");
    expect(BANNED_PHRASES).toContain("proven cause");
    expect(BANNED_PHRASES).toContain("confirms causation");
    expect(BANNED_PHRASES).toContain("scientific proof");
  });
});
