/**
 * CSV → Prisma orchestrator.
 *
 * Flow:
 *   1. Read & validate the CSV   (csv-reader.ts + row-schema.ts).
 *   2. Upsert distinct Courses, Students, Resources.
 *   3. Upsert Enrollments (one per (student, course) pair).
 *   4. Replace ActivityLog rows for the involved students (clean re-imports).
 *   5. Upsert Grades from the denormalised `final_grade` column.
 *
 * Idempotent: running it twice on the same CSV is a no-op for catalogue
 * tables and yields the same ActivityLog set (because step 4 deletes before
 * insert). Validation errors are surfaced as warnings; the import still
 * proceeds for the valid rows.
 */

import type { PrismaClient } from "@prisma/client";

import { log } from "../../lib/logger";
import { readAndValidateCsv } from "./csv-reader";
import type { ValidatedRow } from "./row-schema";

export interface IngestSummary {
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  courses: number;
  students: number;
  resources: number;
  enrollments: number;
  activityLogs: number;
  grades: number;
  durationMs: number;
}

const ACTIVITY_BATCH_SIZE = 1000;
const COHORT = "2026-spring";

/**
 * Path-based wrapper: read + validate the CSV, then delegate to
 * {@link ingestValidatedRows}. Phase 2's `npm run db:ingest` and Phase 6's
 * upload pipeline both flow through `ingestValidatedRows` so the upsert
 * logic stays single-source.
 */
export async function ingestCsv(
  csvPath: string,
  prisma: PrismaClient,
): Promise<IngestSummary> {
  const { rows, errors } = readAndValidateCsv(csvPath);

  log.info(
    `Read ${rows.length + errors.length} rows from ${csvPath} ` +
      `(${rows.length} valid, ${errors.length} invalid)`,
  );

  if (errors.length > 0) {
    const sample = errors.slice(0, 5);
    log.warn(`First ${sample.length} validation error(s):`);
    for (const e of sample) {
      log.warn(
        `  row ${e.rowNumber} [${e.field}] ${e.message} ` +
          `(raw=${JSON.stringify(e.rawValue)})`,
      );
    }
    if (errors.length > sample.length) {
      log.warn(`  ... and ${errors.length - sample.length} more`);
    }
  }

  if (rows.length === 0) {
    throw new Error(`No valid rows in ${csvPath}; aborting ingest.`);
  }

  return ingestValidatedRows(rows, errors.length, prisma);
}

/**
 * Pure DB-write half of the ingest pipeline. Accepts already-validated rows
 * plus the count of invalid rows that were dropped during validation.
 *
 * Used directly by Phase 6's `commitUpload` (uploaded CSV in memory) and
 * indirectly by Phase 2's `ingestCsv` (CSV on disk).
 */
export async function ingestValidatedRows(
  rows: ValidatedRow[],
  rowsInvalid: number,
  prisma: PrismaClient,
): Promise<IngestSummary> {
  const startedAt = Date.now();

  if (rows.length === 0) {
    throw new Error("No valid rows to ingest; aborting.");
  }

  // --- Courses --------------------------------------------------------------
  const distinctCourseCodes = unique(rows.map((r) => r.courseId));
  const maxWeekByCourse = new Map<string, number>();
  for (const r of rows) {
    const prev = maxWeekByCourse.get(r.courseId) ?? 0;
    if (r.weekNumber > prev) maxWeekByCourse.set(r.courseId, r.weekNumber);
  }
  for (const code of distinctCourseCodes) {
    const weeks = maxWeekByCourse.get(code) ?? 14;
    await prisma.course.upsert({
      where: { code },
      create: { code, title: code, weeks },
      update: { weeks },
    });
  }
  const courseRows = await prisma.course.findMany({
    where: { code: { in: distinctCourseCodes } },
  });
  const courseIdByCode = new Map(courseRows.map((c) => [c.code, c.id]));

  // --- Students -------------------------------------------------------------
  const studentRowByExternalId = new Map<string, ValidatedRow>();
  for (const r of rows) {
    if (!studentRowByExternalId.has(r.studentId)) {
      studentRowByExternalId.set(r.studentId, r);
    }
  }
  for (const [externalId, r] of studentRowByExternalId) {
    await prisma.student.upsert({
      where: { externalId },
      create: { externalId, cohort: COHORT, priorGpa: r.priorGpa },
      update: { priorGpa: r.priorGpa },
    });
  }
  const studentRows = await prisma.student.findMany({
    where: { externalId: { in: [...studentRowByExternalId.keys()] } },
  });
  const studentIdByExternal = new Map(studentRows.map((s) => [s.externalId, s.id]));

  // --- Resources ------------------------------------------------------------
  const resourceRowByExternalId = new Map<string, ValidatedRow>();
  for (const r of rows) {
    if (!resourceRowByExternalId.has(r.resourceId)) {
      resourceRowByExternalId.set(r.resourceId, r);
    }
  }
  for (const [externalId, r] of resourceRowByExternalId) {
    const courseId = lookup(courseIdByCode, r.courseId, "course");
    await prisma.resource.upsert({
      where: { externalId },
      create: {
        externalId,
        courseId,
        type: r.resourceType,
        title: externalId,
      },
      update: { type: r.resourceType, courseId },
    });
  }
  const resourceRows = await prisma.resource.findMany({
    where: { externalId: { in: [...resourceRowByExternalId.keys()] } },
  });
  const resourceIdByExternal = new Map(resourceRows.map((r) => [r.externalId, r.id]));

  // --- Enrollments ----------------------------------------------------------
  const enrollmentKeys = new Set<string>();
  for (const r of rows) enrollmentKeys.add(`${r.studentId}::${r.courseId}`);
  let enrollments = 0;
  for (const key of enrollmentKeys) {
    const [externalStudentId, courseCode] = key.split("::") as [string, string];
    const studentId = lookup(studentIdByExternal, externalStudentId, "student");
    const courseId = lookup(courseIdByCode, courseCode, "course");
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId },
      update: {},
    });
    enrollments += 1;
  }

  // --- ActivityLog ----------------------------------------------------------
  // ActivityLog has no natural composite unique key (a student can VIEW the
  // same resource at the same second), so per-row upserts would be contrived.
  // Replace-by-student is cleaner: clear the rows owned by this import's
  // student set, then bulk-insert. Repeat imports stay consistent.
  const studentIds = [...studentIdByExternal.values()];
  await prisma.activityLog.deleteMany({ where: { studentId: { in: studentIds } } });

  let activityLogs = 0;
  let batch: Array<{
    studentId: string;
    courseId: string;
    resourceId: string;
    activityType: string;
    timestamp: Date;
    durationSeconds: number;
    weekNumber: number;
    quizScore: number | null;
  }> = [];
  for (const r of rows) {
    batch.push({
      studentId: lookup(studentIdByExternal, r.studentId, "student"),
      courseId: lookup(courseIdByCode, r.courseId, "course"),
      resourceId: lookup(resourceIdByExternal, r.resourceId, "resource"),
      activityType: r.activityType,
      timestamp: r.timestamp,
      durationSeconds: r.durationSeconds,
      weekNumber: r.weekNumber,
      quizScore: r.quizScore,
    });
    if (batch.length >= ACTIVITY_BATCH_SIZE) {
      const written = batch;
      batch = [];
      const res = await prisma.activityLog.createMany({ data: written });
      activityLogs += res.count;
    }
  }
  if (batch.length > 0) {
    const res = await prisma.activityLog.createMany({ data: batch });
    activityLogs += res.count;
  }

  // --- Grades --------------------------------------------------------------
  const gradeByKey = new Map<
    string,
    { studentId: string; courseId: string; finalGrade: number }
  >();
  for (const r of rows) {
    const key = `${r.studentId}::${r.courseId}`;
    if (gradeByKey.has(key)) continue;
    gradeByKey.set(key, {
      studentId: lookup(studentIdByExternal, r.studentId, "student"),
      courseId: lookup(courseIdByCode, r.courseId, "course"),
      finalGrade: r.finalGrade,
    });
  }
  let grades = 0;
  for (const { studentId, courseId, finalGrade } of gradeByKey.values()) {
    const letter = letterFor(finalGrade);
    await prisma.grade.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId, finalGrade, letter },
      update: { finalGrade, letter },
    });
    grades += 1;
  }

  return {
    rowsRead: rows.length + rowsInvalid,
    rowsValid: rows.length,
    rowsInvalid,
    courses: distinctCourseCodes.length,
    students: studentRowByExternalId.size,
    resources: resourceRowByExternalId.size,
    enrollments,
    activityLogs,
    grades,
    durationMs: Date.now() - startedAt,
  };
}

// ---- helpers ---------------------------------------------------------------

function unique<T>(arr: ReadonlyArray<T>): T[] {
  return [...new Set(arr)];
}

function lookup<K, V>(map: Map<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${label} lookup for key ${String(key)}`);
  }
  return value;
}

function letterFor(grade: number): string {
  if (grade >= 85) return "A";
  if (grade >= 70) return "B";
  if (grade >= 55) return "C";
  if (grade >= 40) return "D";
  return "F";
}
