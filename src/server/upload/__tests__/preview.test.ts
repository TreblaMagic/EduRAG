import { describe, expect, it } from "vitest";

import { parseAndValidateCsv } from "@/server/ingest/csv-reader";
import type { ValidatedRow, ValidationError } from "@/server/ingest/row-schema";
import {
  PREVIEW_ERROR_LIMIT,
  PREVIEW_SAMPLE_LIMIT,
  buildPreviewResult,
  capErrors,
  capSampleRows,
  summariseValidated,
  toPreviewError,
  toSampleRow,
} from "../preview";

function row(overrides: Partial<ValidatedRow> = {}): ValidatedRow {
  return {
    studentId: "STU-0001",
    courseId: "CS-201",
    weekNumber: 1,
    resourceId: "CS-201-VID-001",
    resourceType: "VIDEO",
    activityType: "VIEW",
    timestamp: new Date("2026-01-12T10:00:00Z"),
    durationSeconds: 540,
    quizScore: null,
    forumPosts: 0,
    priorGpa: 3.2,
    finalGrade: 78.5,
    ...overrides,
  };
}

describe("summariseValidated", () => {
  it("counts distinct students and courses across rows", () => {
    const rows = [
      row({ studentId: "A", courseId: "X" }),
      row({ studentId: "B", courseId: "X" }),
      row({ studentId: "A", courseId: "Y" }),
    ];
    const stats = summariseValidated(rows, 7);
    expect(stats.totalRows).toBe(10);
    expect(stats.validRows).toBe(3);
    expect(stats.invalidRows).toBe(7);
    expect(stats.distinctStudents).toBe(2);
    expect(stats.distinctCourses).toBe(2);
  });

  it("returns zero counts on empty input", () => {
    const stats = summariseValidated([], 0);
    expect(stats).toEqual({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      distinctStudents: 0,
      distinctCourses: 0,
    });
  });
});

describe("toSampleRow / toPreviewError", () => {
  it("serialises the timestamp to an ISO string", () => {
    const sample = toSampleRow(row());
    expect(sample.timestamp).toBe("2026-01-12T10:00:00.000Z");
    expect(sample.studentId).toBe("STU-0001");
  });

  it("preserves all the dashboard-facing columns", () => {
    const sample = toSampleRow(row({ quizScore: 82.5, forumPosts: 1 }));
    expect(sample.quizScore).toBe(82.5);
    expect(sample.forumPosts).toBe(1);
    expect(sample.resourceType).toBe("VIDEO");
    expect(sample.activityType).toBe("VIEW");
  });

  it("normalises a missing rawValue to null", () => {
    const err: ValidationError = {
      rowNumber: 5,
      field: "quiz_score",
      message: "missing",
      rawValue: undefined,
    };
    const out = toPreviewError(err);
    expect(out.rawValue).toBeNull();
    expect(out.rowNumber).toBe(5);
  });
});

describe("capSampleRows / capErrors", () => {
  it("caps the sample at PREVIEW_SAMPLE_LIMIT", () => {
    const many = Array.from({ length: PREVIEW_SAMPLE_LIMIT + 5 }, () => row());
    expect(capSampleRows(many)).toHaveLength(PREVIEW_SAMPLE_LIMIT);
  });

  it("caps the error list at PREVIEW_ERROR_LIMIT", () => {
    const many: ValidationError[] = Array.from({ length: PREVIEW_ERROR_LIMIT + 5 }, (_, i) => ({
      rowNumber: i + 2,
      field: "duration_seconds",
      message: "bad",
      rawValue: "x",
    }));
    expect(capErrors(many)).toHaveLength(PREVIEW_ERROR_LIMIT);
  });
});

describe("buildPreviewResult", () => {
  it("returns ok=true when there is at least one valid row", () => {
    const result = buildPreviewResult({
      filename: "x.csv",
      byteSize: 100,
      rows: [row()],
      errors: [],
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.stats.validRows).toBe(1);
    expect(result.sampleRows).toHaveLength(1);
  });

  it("returns ok=false with an error message when zero valid rows", () => {
    const result = buildPreviewResult({
      filename: "broken.csv",
      byteSize: 100,
      rows: [],
      errors: [{ rowNumber: 2, field: "student_id", message: "missing", rawValue: "" }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No valid rows/);
  });
});

describe("parseAndValidateCsv (Buffer input)", () => {
  const HEADER =
    "student_id,course_id,week_number,resource_id,resource_type,activity_type,timestamp,duration_seconds,quiz_score,forum_posts,prior_gpa,final_grade";

  it("parses a small valid CSV from a Buffer", () => {
    const csv =
      `${HEADER}\n` +
      `STU-1,CS-201,1,CS-201-VID-001,VIDEO,VIEW,2026-01-12T10:00:00+00:00,300,,0,3.0,75\n` +
      `STU-2,CS-201,2,CS-201-QUI-001,QUIZ,SUBMIT,2026-01-19T10:00:00+00:00,600,80,0,2.5,68\n`;
    const out = parseAndValidateCsv(Buffer.from(csv, "utf8"));
    expect(out.rows).toHaveLength(2);
    expect(out.errors).toHaveLength(0);
    expect(out.rows[0]?.studentId).toBe("STU-1");
    expect(out.rows[1]?.quizScore).toBe(80);
  });

  it("returns structured errors for invalid rows", () => {
    const csv =
      `${HEADER}\n` +
      `STU-1,CS-201,not-a-week,CS-201-VID-001,PODCAST,LIKE,2026-01-12,abc,,0,5.0,150\n`;
    const out = parseAndValidateCsv(Buffer.from(csv, "utf8"));
    expect(out.rows).toHaveLength(0);
    expect(out.errors.length).toBeGreaterThan(0);
    const fields = new Set(out.errors.map((e) => e.field));
    expect(fields.has("resource_type")).toBe(true);
    expect(fields.has("activity_type")).toBe(true);
  });
});
