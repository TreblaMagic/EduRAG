/**
 * Student-detail queries.
 *
 * Returns one rectangular `StudentDetail` blob the student page can
 * render without further per-row joins.
 */

import type { PrismaClient } from "@prisma/client";

import type { PredictionResult } from "@/features/baseline-ml";
import type { CausalNode, ConfidenceLevel } from "@/features/causal-engine";
import type {
  InterventionDecisionView,
  TimelineEvent,
} from "@/features/intervention-tracking";
import {
  getDecisionsForStudent,
  getInterventionTimelineForStudent,
} from "@/server/intervention-tracking";

import { prisma as defaultPrisma } from "../../lib/db";

export interface WeeklyTimelinePoint {
  week: number;
  engagement: number | null;
  rdi: number | null;
  quizAverage: number | null;
}

export interface StudentInterventionRow {
  /** Phase 11 — the `InterventionSimulation.id` row backing this recommendation. */
  interventionSimulationId: string;
  interventionName: string;
  treatment: CausalNode;
  baselineValue: number;
  proposedValue: number;
  appliedDelta: number;
  estimatedEffect: number;
  baselineGrade: number;
  projectedGrade: number;
  projectedLow: number;
  projectedHigh: number;
  rankScore: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

export interface StudentDetail {
  student: {
    externalId: string;
    cohort: string;
    priorGpa: number;
  };
  course: { code: string; title: string } | null;
  finalGrade: number | null;
  features: {
    meanEngagement: number;
    meanRdi: number;
    meanLoginsPerWeek: number;
    totalActivity: number;
    weeksObserved: number;
    engagementConsistency: number;
    engagementTrend: number;
    forumParticipation: number;
    quizConsistency: number;
    assessmentTrend: number;
  } | null;
  timeline: WeeklyTimelinePoint[];
  interventions: StudentInterventionRow[];
  /** Phase 11 — decision rows keyed by `interventionSimulationId`. */
  decisions: Map<string, InterventionDecisionView>;
  /** Phase 11 — chronological feed of recommendation / decision / note / follow-up events. */
  interventionEvents: TimelineEvent[];
  cohortAverages: {
    grade: number;
    rdi: number;
    engagement: number;
  } | null;
  prediction: PredictionResult | null;
}

export async function getStudentDetail(
  externalId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<StudentDetail | null> {
  const student = await prisma.student.findUnique({ where: { externalId } });
  if (!student) return null;

  const courseFeature = await prisma.courseFeatureSummary.findFirst({
    where: { studentId: student.id },
    include: { course: { select: { code: true, title: true } } },
  });

  let finalGrade: number | null = null;
  let timeline: WeeklyTimelinePoint[] = [];
  let interventions: StudentInterventionRow[] = [];
  let cohortAverages: StudentDetail["cohortAverages"] = null;
  let prediction: PredictionResult | null = null;
  let decisions: Map<string, InterventionDecisionView> = new Map();
  let interventionEvents: TimelineEvent[] = [];

  if (courseFeature) {
    const [gradeRow, weeklies, rdiScores, interventionRows, cohortFeatures, cohortGrades, predictionRow] =
      await Promise.all([
        prisma.grade.findUnique({
          where: {
            studentId_courseId: { studentId: student.id, courseId: courseFeature.courseId },
          },
          select: { finalGrade: true },
        }),
        prisma.weeklyEngagementSummary.findMany({
          where: { studentId: student.id, courseId: courseFeature.courseId },
          orderBy: { weekNumber: "asc" },
        }),
        prisma.rdiScore.findMany({
          where: { studentId: student.id, courseId: courseFeature.courseId },
          orderBy: { weekNumber: "asc" },
        }),
        prisma.interventionSimulation.findMany({
          where: { studentId: student.id, courseId: courseFeature.courseId },
          orderBy: { rankScore: "desc" },
        }),
        prisma.courseFeatureSummary.findMany({
          where: { courseId: courseFeature.courseId },
          select: { meanRdi: true, meanEngagement: true },
        }),
        prisma.grade.findMany({
          where: { courseId: courseFeature.courseId },
          select: { finalGrade: true },
        }),
        prisma.baselinePrediction.findFirst({
          where: { studentId: student.id, courseId: courseFeature.courseId },
          orderBy: { generatedAt: "desc" },
        }),
      ]);

    finalGrade = gradeRow?.finalGrade ?? null;

    const rdiByWeek = new Map(rdiScores.map((r) => [r.weekNumber, r.value]));
    timeline = weeklies.map((w) => ({
      week: w.weekNumber,
      engagement: w.engagementScore,
      rdi: rdiByWeek.get(w.weekNumber) ?? null,
      quizAverage: w.averageQuizScore,
    }));

    interventions = interventionRows.map((row) => ({
      interventionSimulationId: row.id,
      interventionName: row.interventionName,
      treatment: row.treatment as CausalNode,
      baselineValue: row.baselineValue,
      proposedValue: row.proposedValue,
      appliedDelta: row.appliedDelta,
      estimatedEffect: row.estimatedEffect,
      baselineGrade: row.baselineGrade,
      projectedGrade: row.projectedGrade,
      projectedLow: row.projectedLow,
      projectedHigh: row.projectedHigh,
      rankScore: row.rankScore,
      confidence: row.confidence as ConfidenceLevel,
      explanation: row.explanation,
    }));

    // Phase 11 — decisions + timeline.
    [decisions, interventionEvents] = await Promise.all([
      getDecisionsForStudent(student.id, courseFeature.courseId, prisma),
      getInterventionTimelineForStudent(student.id, courseFeature.courseId, prisma),
    ]);

    cohortAverages = {
      grade: mean(cohortGrades.map((g) => g.finalGrade)),
      rdi: mean(cohortFeatures.map((c) => c.meanRdi)),
      engagement: mean(cohortFeatures.map((c) => c.meanEngagement)),
    };

    if (predictionRow) {
      prediction = {
        studentId: predictionRow.studentId,
        courseId: predictionRow.courseId,
        modelType: predictionRow.modelType as PredictionResult["modelType"],
        predictedRiskProb: predictionRow.predictedRiskProb,
        predictedGrade: predictionRow.predictedGrade,
        riskClass: predictionRow.riskClass as PredictionResult["riskClass"],
        threshold: predictionRow.threshold,
        confidence: predictionRow.predictionConfidence as PredictionResult["confidence"],
        featureImportance: parseImportanceField(predictionRow.featureImportanceJson),
        notes: parseNotesField(predictionRow.notesJson),
        warnings: parseWarningsField(predictionRow.notesJson),
      };
    }
  }

  return {
    student: {
      externalId: student.externalId,
      cohort: student.cohort,
      priorGpa: student.priorGpa,
    },
    course: courseFeature?.course
      ? { code: courseFeature.course.code, title: courseFeature.course.title }
      : null,
    finalGrade,
    features: courseFeature
      ? {
          meanEngagement: courseFeature.meanEngagement,
          meanRdi: courseFeature.meanRdi,
          meanLoginsPerWeek: courseFeature.meanLoginsPerWeek,
          totalActivity: courseFeature.totalActivity,
          weeksObserved: courseFeature.weeksObserved,
          engagementConsistency: courseFeature.engagementConsistency,
          engagementTrend: courseFeature.engagementTrend,
          forumParticipation: courseFeature.forumParticipation,
          quizConsistency: courseFeature.quizConsistency,
          assessmentTrend: courseFeature.assessmentTrend,
        }
      : null,
    timeline,
    interventions,
    decisions,
    interventionEvents,
    cohortAverages,
    prediction,
  };
}

function parseImportanceField(json: string): PredictionResult["featureImportance"] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as PredictionResult["featureImportance"];
  } catch {
    /* fall through */
  }
  return [];
}

function parseNotesField(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { notes?: string[] };
    return parsed.notes ?? [];
  } catch {
    return [];
  }
}

function parseWarningsField(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { warnings?: string[] };
    return parsed.warnings ?? [];
  } catch {
    return [];
  }
}

export interface StudentDropdownEntry {
  externalId: string;
  priorGpa: number;
  finalGrade: number | null;
}

export async function listStudentsForDropdown(
  prisma: PrismaClient = defaultPrisma,
): Promise<StudentDropdownEntry[]> {
  const students = await prisma.student.findMany({
    select: {
      externalId: true,
      priorGpa: true,
      grades: { select: { finalGrade: true }, take: 1 },
    },
    orderBy: { externalId: "asc" },
  });
  return students.map((s) => ({
    externalId: s.externalId,
    priorGpa: s.priorGpa,
    finalGrade: s.grades[0]?.finalGrade ?? null,
  }));
}

function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
