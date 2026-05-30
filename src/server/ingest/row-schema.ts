/**
 * CSV row validation.
 *
 * Each row from `sample_lms_data.csv` is checked field-by-field and either
 * coerced to a typed {@link ValidatedRow} or rejected with a list of
 * structured errors. Errors include the source row number so the operator
 * can find the offending line in the CSV directly.
 *
 * Implemented without a runtime validation library to keep the dependency
 * surface minimal (per `CLAUDE.md` and `MasterRule.md`). If validation needs
 * grow, a zod schema is a low-cost upgrade.
 */

import { RESOURCE_TYPES, type ResourceType } from "../../features/analytics/rdi";
import { ACTIVITY_TYPES, type ActivityType } from "../../features/analytics/engagement";

export interface RawCsvRow {
  student_id?: string;
  course_id?: string;
  week_number?: string;
  resource_id?: string;
  resource_type?: string;
  activity_type?: string;
  timestamp?: string;
  duration_seconds?: string;
  quiz_score?: string;
  forum_posts?: string;
  prior_gpa?: string;
  final_grade?: string;
}

export interface ValidatedRow {
  studentId: string;
  courseId: string;
  weekNumber: number;
  resourceId: string;
  resourceType: ResourceType;
  activityType: ActivityType;
  timestamp: Date;
  durationSeconds: number;
  quizScore: number | null;
  forumPosts: number;
  priorGpa: number;
  finalGrade: number;
}

export interface ValidationError {
  rowNumber: number;
  field: string;
  message: string;
  rawValue: string | undefined;
}

export type ValidationOutcome =
  | { ok: true; row: ValidatedRow }
  | { ok: false; errors: ValidationError[] };

const RESOURCE_TYPE_SET = new Set<string>(RESOURCE_TYPES);
const ACTIVITY_TYPE_SET = new Set<string>(ACTIVITY_TYPES);

interface NumberOpts {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function validateRow(row: RawCsvRow, rowNumber: number): ValidationOutcome {
  const errors: ValidationError[] = [];

  const requireText = (field: keyof RawCsvRow): string => {
    const value = row[field];
    if (typeof value !== "string" || value.length === 0) {
      errors.push({ rowNumber, field, message: "missing or empty", rawValue: value });
      return "";
    }
    return value;
  };

  const requireNumber = (field: keyof RawCsvRow, opts: NumberOpts = {}): number => {
    const value = row[field];
    if (typeof value !== "string" || value.length === 0) {
      errors.push({ rowNumber, field, message: "missing or empty number", rawValue: value });
      return NaN;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      errors.push({ rowNumber, field, message: "not a finite number", rawValue: value });
      return NaN;
    }
    if (opts.integer && !Number.isInteger(n)) {
      errors.push({ rowNumber, field, message: "expected integer", rawValue: value });
    }
    if (opts.min !== undefined && n < opts.min) {
      errors.push({ rowNumber, field, message: `below minimum ${opts.min}`, rawValue: value });
    }
    if (opts.max !== undefined && n > opts.max) {
      errors.push({ rowNumber, field, message: `above maximum ${opts.max}`, rawValue: value });
    }
    return n;
  };

  const optionalNumber = (field: keyof RawCsvRow, opts: NumberOpts = {}): number | null => {
    const value = row[field];
    if (value === undefined || value === "") return null;
    return requireNumber(field, opts);
  };

  const studentId = requireText("student_id");
  const courseId = requireText("course_id");
  const weekNumber = requireNumber("week_number", { integer: true, min: 1, max: 60 });
  const resourceId = requireText("resource_id");
  const resourceTypeRaw = requireText("resource_type");
  const activityTypeRaw = requireText("activity_type");
  const timestampRaw = requireText("timestamp");
  const durationSeconds = requireNumber("duration_seconds", { integer: true, min: 0 });
  const quizScore = optionalNumber("quiz_score", { min: 0, max: 100 });
  const forumPosts = requireNumber("forum_posts", { integer: true, min: 0 });
  const priorGpa = requireNumber("prior_gpa", { min: 0, max: 4 });
  const finalGrade = requireNumber("final_grade", { min: 0, max: 100 });

  if (resourceTypeRaw && !RESOURCE_TYPE_SET.has(resourceTypeRaw)) {
    errors.push({
      rowNumber,
      field: "resource_type",
      message: `expected one of ${[...RESOURCE_TYPE_SET].join(", ")}`,
      rawValue: resourceTypeRaw,
    });
  }
  if (activityTypeRaw && !ACTIVITY_TYPE_SET.has(activityTypeRaw)) {
    errors.push({
      rowNumber,
      field: "activity_type",
      message: `expected one of ${[...ACTIVITY_TYPE_SET].join(", ")}`,
      rawValue: activityTypeRaw,
    });
  }

  let timestamp = new Date(NaN);
  if (timestampRaw) {
    timestamp = new Date(timestampRaw);
    if (Number.isNaN(timestamp.getTime())) {
      errors.push({
        rowNumber,
        field: "timestamp",
        message: "invalid ISO-8601 timestamp",
        rawValue: timestampRaw,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    row: {
      studentId,
      courseId,
      weekNumber,
      resourceId,
      resourceType: resourceTypeRaw as ResourceType,
      activityType: activityTypeRaw as ActivityType,
      timestamp,
      durationSeconds,
      quizScore,
      forumPosts,
      priorGpa,
      finalGrade,
    },
  };
}
