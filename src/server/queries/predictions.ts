/**
 * Phase 8 — prediction queries.
 *
 * Reads from `BaselinePrediction`. The shape is JSON-friendly so the UI
 * can render either a single student's prediction (on `/students/[id]`)
 * or a cohort table (on `/comparison`).
 */

import type { PrismaClient } from "@prisma/client";

import type {
  FeatureImportance,
  ModelType,
  PredictionConfidence,
  PredictionResult,
  RiskClass,
} from "@/features/baseline-ml";

import { prisma as defaultPrisma } from "../../lib/db";

export interface PredictionRow {
  studentId: string;
  studentExternalId: string;
  courseCode: string;
  modelType: ModelType;
  predictedRiskProb: number;
  predictedGrade: number | null;
  riskClass: RiskClass;
  confidence: PredictionConfidence;
  threshold: number;
  featureImportance: FeatureImportance[];
  notes: string[];
  generatedAt: string;
}

export async function getPredictionForStudent(
  studentExternalId: string,
  courseCode: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PredictionResult | null> {
  const student = await prisma.student.findUnique({
    where: { externalId: studentExternalId },
  });
  if (!student) return null;
  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) return null;
  const row = await prisma.baselinePrediction.findFirst({
    where: { studentId: student.id, courseId: course.id },
    orderBy: { generatedAt: "desc" },
  });
  if (!row) return null;
  return toPredictionResult(row);
}

export async function getPredictionsForCourse(
  courseCode: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PredictionRow[]> {
  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) return [];
  const rows = await prisma.baselinePrediction.findMany({
    where: { courseId: course.id },
    include: {
      student: { select: { externalId: true } },
      course: { select: { code: true } },
    },
    orderBy: { predictedRiskProb: "desc" },
  });
  return rows.map((r) => ({
    studentId: r.studentId,
    studentExternalId: r.student.externalId,
    courseCode: r.course.code,
    modelType: r.modelType as ModelType,
    predictedRiskProb: r.predictedRiskProb,
    predictedGrade: r.predictedGrade,
    riskClass: r.riskClass as RiskClass,
    confidence: r.predictionConfidence as PredictionConfidence,
    threshold: r.threshold,
    featureImportance: parseImportance(r.featureImportanceJson),
    notes: parseNotes(r.notesJson),
    generatedAt: r.generatedAt.toISOString(),
  }));
}

function toPredictionResult(row: {
  studentId: string;
  courseId: string;
  modelType: string;
  predictedRiskProb: number;
  predictedGrade: number | null;
  riskClass: string;
  predictionConfidence: string;
  threshold: number;
  featureImportanceJson: string;
  notesJson: string;
}): PredictionResult {
  return {
    studentId: row.studentId,
    courseId: row.courseId,
    modelType: row.modelType as ModelType,
    predictedRiskProb: row.predictedRiskProb,
    predictedGrade: row.predictedGrade,
    riskClass: row.riskClass as RiskClass,
    threshold: row.threshold,
    confidence: row.predictionConfidence as PredictionConfidence,
    featureImportance: parseImportance(row.featureImportanceJson),
    notes: parseNotes(row.notesJson),
    warnings: parseWarnings(row.notesJson),
  };
}

function parseImportance(json: string): FeatureImportance[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as FeatureImportance[];
  } catch {
    /* fall through */
  }
  return [];
}

function parseNotes(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { notes?: string[] };
    return parsed.notes ?? [];
  } catch {
    return [];
  }
}

function parseWarnings(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { warnings?: string[] };
    return parsed.warnings ?? [];
  } catch {
    return [];
  }
}
