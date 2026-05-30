/**
 * Phase 6 — upload preview helpers.
 *
 * Pure transformations: turn a `parseAndValidateCsv` result into the
 * UI-facing `PreviewResult` shape, with stats, capped sample rows, and a
 * stable JSON-friendly error list.
 */

import type { ValidatedRow, ValidationError } from "@/server/ingest/row-schema";
import type {
  PreviewError,
  PreviewResult,
  PreviewSampleRow,
  PreviewStats,
} from "./types";

export const PREVIEW_SAMPLE_LIMIT = 20;
export const PREVIEW_ERROR_LIMIT = 50;

/** Compute the headline counters for the preview card. */
export function summariseValidated(
  rows: ReadonlyArray<ValidatedRow>,
  errorCount: number,
): PreviewStats {
  const students = new Set<string>();
  const courses = new Set<string>();
  for (const r of rows) {
    students.add(r.studentId);
    courses.add(r.courseId);
  }
  return {
    totalRows: rows.length + errorCount,
    validRows: rows.length,
    invalidRows: errorCount,
    distinctStudents: students.size,
    distinctCourses: courses.size,
  };
}

/** Convert a validated row to its JSON-serialisable preview shape. */
export function toSampleRow(row: ValidatedRow): PreviewSampleRow {
  return {
    studentId: row.studentId,
    courseId: row.courseId,
    weekNumber: row.weekNumber,
    resourceId: row.resourceId,
    resourceType: row.resourceType,
    activityType: row.activityType,
    timestamp: row.timestamp.toISOString(),
    durationSeconds: row.durationSeconds,
    quizScore: row.quizScore,
    forumPosts: row.forumPosts,
    priorGpa: row.priorGpa,
    finalGrade: row.finalGrade,
  };
}

/** Convert internal validation errors to the JSON-serialisable preview shape. */
export function toPreviewError(err: ValidationError): PreviewError {
  return {
    rowNumber: err.rowNumber,
    field: err.field,
    message: err.message,
    rawValue: err.rawValue ?? null,
  };
}

/** Cap arrays so server actions don't return megabytes of metadata. */
export function capSampleRows(rows: ReadonlyArray<ValidatedRow>): PreviewSampleRow[] {
  return rows.slice(0, PREVIEW_SAMPLE_LIMIT).map(toSampleRow);
}

export function capErrors(errors: ReadonlyArray<ValidationError>): PreviewError[] {
  return errors.slice(0, PREVIEW_ERROR_LIMIT).map(toPreviewError);
}

/** Build the full `PreviewResult` from a parse outcome. */
export function buildPreviewResult(args: {
  filename: string;
  byteSize: number;
  rows: ReadonlyArray<ValidatedRow>;
  errors: ReadonlyArray<ValidationError>;
}): PreviewResult {
  const stats = summariseValidated(args.rows, args.errors.length);
  const ok = stats.validRows > 0;
  return {
    ok,
    filename: args.filename,
    byteSize: args.byteSize,
    stats,
    sampleRows: capSampleRows(args.rows),
    errors: capErrors(args.errors),
    error: ok ? null : "No valid rows found in this CSV.",
  };
}
