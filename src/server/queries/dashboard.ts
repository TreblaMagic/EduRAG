/**
 * Overview-dashboard queries.
 *
 * Returns one rectangular `DashboardData` blob the home page can render
 * without further per-row joins. The pure shaping helpers
 * (`computeRiskCount`, `pickStrongestDriver`) are exported separately so
 * they can be unit-tested without a database.
 */

import type { PrismaClient } from "@prisma/client";

import type { ConfidenceLevel } from "@/features/causal-engine";

import { prisma as defaultPrisma } from "../../lib/db";
import { confidenceForRefutationJson } from "./shared";

export interface DashboardMetrics {
  totalStudents: number;
  courseCount: number;
  averageFinalGrade: number;
  averageRdi: number;
  atRiskCount: number;
  strongestDriver: {
    treatment: string;
    estimate: number;
    confidence: ConfidenceLevel;
  } | null;
}

export interface DashboardCohortRow {
  studentExternalId: string;
  priorGpa: number;
  finalGrade: number;
  meanRdi: number;
  meanEngagement: number;
  topIntervention: {
    name: string;
    treatment: string;
    projectedGrade: number;
    projectedLow: number;
    projectedHigh: number;
    confidence: ConfidenceLevel;
  } | null;
}

export interface DashboardData {
  course: { code: string; title: string } | null;
  metrics: DashboardMetrics;
  cohort: DashboardCohortRow[];
}

const AT_RISK_THRESHOLD = 55;

export async function getDashboardData(prisma: PrismaClient = defaultPrisma): Promise<DashboardData> {
  const course = await prisma.course.findFirst({
    orderBy: { code: "asc" },
    select: { id: true, code: true, title: true },
  });

  const [students, courseFeatures, grades, causalEstimates, topInterventions] = await Promise.all([
    prisma.student.findMany({ select: { id: true, externalId: true, priorGpa: true } }),
    course
      ? prisma.courseFeatureSummary.findMany({
          where: { courseId: course.id },
          select: { studentId: true, meanRdi: true, meanEngagement: true },
        })
      : Promise.resolve([] as Array<{ studentId: string; meanRdi: number; meanEngagement: number }>),
    course
      ? prisma.grade.findMany({
          where: { courseId: course.id },
          select: { studentId: true, finalGrade: true },
        })
      : Promise.resolve([] as Array<{ studentId: string; finalGrade: number }>),
    course
      ? prisma.causalEstimate.findMany({
          where: { courseId: course.id, outcome: "FinalGrade" },
        })
      : Promise.resolve([] as Array<never>),
    course
      ? prisma.interventionSimulation.findMany({
          where: { courseId: course.id },
          orderBy: [{ studentId: "asc" }, { rankScore: "desc" }],
        })
      : Promise.resolve([] as Array<never>),
  ]);

  const courseCount = await prisma.course.count();

  const featureByStudent = new Map(courseFeatures.map((c) => [c.studentId, c]));
  const gradeByStudent = new Map(grades.map((g) => [g.studentId, g.finalGrade]));

  // Group top intervention per student (first row after sorting by rankScore desc).
  const topByStudent = new Map<string, (typeof topInterventions)[number]>();
  for (const sim of topInterventions) {
    if (!topByStudent.has(sim.studentId)) topByStudent.set(sim.studentId, sim);
  }

  const cohort: DashboardCohortRow[] = students
    .map<DashboardCohortRow | null>((s) => {
      const feature = featureByStudent.get(s.id);
      const grade = gradeByStudent.get(s.id);
      if (!feature || grade === undefined) return null;
      const top = topByStudent.get(s.id);
      return {
        studentExternalId: s.externalId,
        priorGpa: s.priorGpa,
        finalGrade: grade,
        meanRdi: feature.meanRdi,
        meanEngagement: feature.meanEngagement,
        topIntervention: top
          ? {
              name: top.interventionName,
              treatment: top.treatment,
              projectedGrade: top.projectedGrade,
              projectedLow: top.projectedLow,
              projectedHigh: top.projectedHigh,
              confidence: top.confidence as ConfidenceLevel,
            }
          : null,
      };
    })
    .filter((r): r is DashboardCohortRow => r !== null)
    .sort((a, b) => a.finalGrade - b.finalGrade);

  return {
    course: course ? { code: course.code, title: course.title } : null,
    metrics: {
      totalStudents: cohort.length,
      courseCount,
      averageFinalGrade: meanOrZero(cohort.map((r) => r.finalGrade)),
      averageRdi: meanOrZero(cohort.map((r) => r.meanRdi)),
      atRiskCount: computeRiskCount(cohort.map((r) => r.finalGrade)),
      strongestDriver: pickStrongestDriver(
        causalEstimates.map((e) => ({
          treatment: e.treatment,
          estimate: e.estimate,
          refutationJson: e.refutationJson,
        })),
      ),
    },
    cohort,
  };
}

// ---- Pure helpers (testable without a database) ----------------------------

export function computeRiskCount(
  grades: ReadonlyArray<number>,
  threshold: number = AT_RISK_THRESHOLD,
): number {
  let n = 0;
  for (const g of grades) {
    if (Number.isFinite(g) && g < threshold) n += 1;
  }
  return n;
}

export interface DriverInput {
  treatment: string;
  estimate: number;
  refutationJson: string | null;
}

/** Pick the driver with the largest |estimate| among those with confidence ≥ medium. */
export function pickStrongestDriver(
  estimates: ReadonlyArray<DriverInput>,
): DashboardMetrics["strongestDriver"] {
  const ranked = estimates
    .map((e) => ({
      treatment: e.treatment,
      estimate: e.estimate,
      confidence: confidenceForRefutationJson(e.refutationJson),
    }))
    .filter((e) => e.confidence !== "low")
    .sort((a, b) => Math.abs(b.estimate) - Math.abs(a.estimate));

  const best = ranked[0];
  if (!best) {
    // Fall back to the strongest of *any* confidence so the dashboard is never blank.
    const fallback = [...estimates].sort(
      (a, b) => Math.abs(b.estimate) - Math.abs(a.estimate),
    )[0];
    if (!fallback) return null;
    return {
      treatment: fallback.treatment,
      estimate: fallback.estimate,
      confidence: confidenceForRefutationJson(fallback.refutationJson),
    };
  }
  return best;
}

function meanOrZero(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
