/**
 * Causal feature table.
 *
 * Reduces the persisted derived tables (`CourseFeatureSummary` + `Grade` +
 * `Student`) into the rectangular per-student feature rows the estimator
 * consumes. One row per (student, course) pair.
 *
 * Pure transformation logic lives in {@link toFeatureRow}; the database
 * wiring lives in {@link buildFeatureTable}. Tests target the pure helper
 * so they do not require a database.
 */

import type { PrismaClient } from "@prisma/client";

import type { CausalNode } from "./dag";

export type FeatureVector = Record<CausalNode, number>;

export interface FeatureRow {
  studentId: string;
  courseId: string;
  features: FeatureVector;
}

/**
 * Shape exposed by the pure mapper. Mirrors the columns we read from the
 * database, decoupled from Prisma types so tests can construct fixtures
 * without importing `@prisma/client`.
 */
export interface RawFeatureSource {
  studentId: string;
  courseId: string;
  priorGpa: number;
  meanEngagement: number;
  meanRdi: number;
  forumParticipation: number;
  quizConsistency: number;
  assessmentTrend: number;
  finalGrade: number;
}

/** Pure mapper: raw DB fields → typed feature vector. */
export function toFeatureRow(raw: RawFeatureSource): FeatureRow {
  return {
    studentId: raw.studentId,
    courseId: raw.courseId,
    features: {
      PriorGPA: raw.priorGpa,
      Engagement: raw.meanEngagement,
      ResourceDiversityIndex: raw.meanRdi,
      ForumParticipation: raw.forumParticipation,
      QuizConsistency: raw.quizConsistency,
      AssessmentTrend: raw.assessmentTrend,
      FinalGrade: raw.finalGrade,
    },
  };
}

/**
 * Build the feature table for a single course by reading
 * `CourseFeatureSummary`, joining `Student.priorGpa` and `Grade.finalGrade`.
 * Students missing a `Grade` row are dropped (they cannot be used to fit
 * the outcome model).
 */
export async function buildFeatureTable(
  prisma: PrismaClient,
  courseId: string,
): Promise<FeatureRow[]> {
  const summaries = await prisma.courseFeatureSummary.findMany({
    where: { courseId },
    include: { student: { select: { priorGpa: true } } },
  });

  const grades = await prisma.grade.findMany({
    where: {
      courseId,
      studentId: { in: summaries.map((s) => s.studentId) },
    },
    select: { studentId: true, finalGrade: true },
  });
  const gradeByStudent = new Map(grades.map((g) => [g.studentId, g.finalGrade]));

  const rows: FeatureRow[] = [];
  for (const s of summaries) {
    const finalGrade = gradeByStudent.get(s.studentId);
    if (finalGrade === undefined) continue;
    rows.push(
      toFeatureRow({
        studentId: s.studentId,
        courseId: s.courseId,
        priorGpa: s.student.priorGpa,
        meanEngagement: s.meanEngagement,
        meanRdi: s.meanRdi,
        forumParticipation: s.forumParticipation,
        quizConsistency: s.quizConsistency,
        assessmentTrend: s.assessmentTrend,
        finalGrade,
      }),
    );
  }
  return rows;
}
