import { describe, expect, it } from "vitest";

import { validateRow, type RawCsvRow } from "../row-schema";

const baseRow: RawCsvRow = {
  student_id: "STU-0001",
  course_id: "CS-201",
  week_number: "1",
  resource_id: "CS-201-VID-001",
  resource_type: "VIDEO",
  activity_type: "VIEW",
  timestamp: "2026-01-12T10:00:00+00:00",
  duration_seconds: "300",
  quiz_score: "",
  forum_posts: "0",
  prior_gpa: "3.2",
  final_grade: "78.5",
};

describe("validateRow", () => {
  it("accepts a well-formed row", () => {
    const out = validateRow(baseRow, 2);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.row.studentId).toBe("STU-0001");
      expect(out.row.weekNumber).toBe(1);
      expect(out.row.durationSeconds).toBe(300);
      expect(out.row.quizScore).toBeNull();
      expect(out.row.priorGpa).toBe(3.2);
      expect(out.row.finalGrade).toBe(78.5);
      expect(out.row.timestamp.getUTCFullYear()).toBe(2026);
    }
  });

  it("parses quiz_score when present", () => {
    const out = validateRow(
      { ...baseRow, resource_type: "QUIZ", activity_type: "SUBMIT", quiz_score: "85.5" },
      2,
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.row.quizScore).toBe(85.5);
  });

  it("rejects an unknown resource_type", () => {
    const out = validateRow({ ...baseRow, resource_type: "PODCAST" }, 5);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.map((e) => e.field)).toContain("resource_type");
    }
  });

  it("rejects an unknown activity_type", () => {
    const out = validateRow({ ...baseRow, activity_type: "LIKE" }, 5);
    expect(out.ok).toBe(false);
  });

  it("rejects a non-numeric duration", () => {
    const out = validateRow({ ...baseRow, duration_seconds: "abc" }, 5);
    expect(out.ok).toBe(false);
  });

  it("rejects an out-of-range prior_gpa", () => {
    const out = validateRow({ ...baseRow, prior_gpa: "9.0" }, 5);
    expect(out.ok).toBe(false);
  });

  it("rejects a negative week_number", () => {
    const out = validateRow({ ...baseRow, week_number: "-5" }, 5);
    expect(out.ok).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    const out = validateRow({ ...baseRow, timestamp: "not-a-date" }, 5);
    expect(out.ok).toBe(false);
  });

  it("rejects an empty student_id", () => {
    const out = validateRow({ ...baseRow, student_id: "" }, 5);
    expect(out.ok).toBe(false);
  });

  it("propagates the row number into every error", () => {
    const out = validateRow({ ...baseRow, week_number: "-5", duration_seconds: "abc" }, 42);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.length).toBeGreaterThanOrEqual(2);
      expect(out.errors.every((e) => e.rowNumber === 42)).toBe(true);
    }
  });
});
