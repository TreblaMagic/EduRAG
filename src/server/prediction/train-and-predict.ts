/**
 * Phase 8 — orchestrate the baseline-prediction layer for one course.
 *
 * 1. Read the persisted feature table (`CourseFeatureSummary` + `Grade`)
 *    via the existing Phase 3 helper — never re-implement feature
 *    engineering.
 * 2. Fit a logistic-regression model on the cohort.
 * 3. Predict for every student and persist one row per (student, course,
 *    model) on `BaselinePrediction`.
 * 4. Return a structured summary the CLI / API can render.
 *
 * The orchestrator never knows which engine produced the model — it talks
 * to the {@link PredictionEngine} interface, same posture as Phase 7.
 */

import type { PrismaClient } from "@prisma/client";

import {
  selectPredictionEngine,
  type ModelType,
  type PredictionEngineName,
  type PredictionResult,
  type PredictionTrainingRow,
  type TrainedModel,
} from "@/features/baseline-ml";
import { buildFeatureTable } from "@/features/causal-engine";
import { log } from "@/lib/logger";

export interface TrainAndPredictSummary {
  courseCode: string;
  courseId: string;
  engineRequested: PredictionEngineName;
  engineResolved: PredictionEngineName;
  engineWarnings: string[];
  modelType: ModelType;
  sampleSize: number;
  threshold: number;
  trainLogLoss: number;
  trainAccuracy: number;
  rowsWritten: number;
  riskDistribution: { atRisk: number; borderline: number; onTrack: number };
  durationMs: number;
  warnings: string[];
}

export interface TrainAndPredictOptions {
  engine?: PredictionEngineName;
  modelType?: ModelType;
  threshold?: number;
  seed?: number;
}

const MIN_SAMPLE_SIZE = 10;

export async function trainAndPredict(
  prisma: PrismaClient,
  courseCode: string,
  options: TrainAndPredictOptions = {},
): Promise<TrainAndPredictSummary> {
  const startedAt = Date.now();
  const engineName = options.engine ?? "baseline";
  const modelType = options.modelType ?? "logistic";

  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) throw new Error(`Course not found: ${courseCode}`);

  const featureRows = await buildFeatureTable(prisma, course.id);
  if (featureRows.length < MIN_SAMPLE_SIZE) {
    throw new Error(
      `Too few feature rows for ${courseCode}: ${featureRows.length} (need ≥ ${MIN_SAMPLE_SIZE}). Run \`npm run db:ingest\` first.`,
    );
  }

  const trainingRows: PredictionTrainingRow[] = featureRows.map((r) => ({
    studentId: r.studentId,
    courseId: r.courseId,
    features: {
      PriorGPA: r.features.PriorGPA,
      MeanEngagement: r.features.Engagement,
      MeanRdi: r.features.ResourceDiversityIndex,
      ForumParticipation: r.features.ForumParticipation,
      QuizConsistency: r.features.QuizConsistency,
      AssessmentTrend: r.features.AssessmentTrend,
      MeanLoginsPerWeek: 0,
    },
    finalGrade: r.features.FinalGrade,
  }));

  // Fill MeanLoginsPerWeek from CourseFeatureSummary (not stored on the
  // causal FeatureRow shape because Phase 3 didn't need it for OLS).
  const summaries = await prisma.courseFeatureSummary.findMany({
    where: { courseId: course.id },
    select: { studentId: true, meanLoginsPerWeek: true },
  });
  const loginsByStudent = new Map(
    summaries.map((s) => [s.studentId, s.meanLoginsPerWeek]),
  );
  for (const row of trainingRows) {
    row.features.MeanLoginsPerWeek = loginsByStudent.get(row.studentId) ?? 0;
  }

  const selected = await selectPredictionEngine(engineName);
  for (const w of selected.warnings) log.warn(w);

  log.info(
    `Training ${modelType} prediction model on ${trainingRows.length} rows for ${courseCode} (engine=${selected.resolvedName})`,
  );

  let model: TrainedModel;
  try {
    model = await selected.engine.train({
      modelType,
      rows: trainingRows,
      threshold: options.threshold,
      seed: options.seed,
    });
  } catch (e) {
    throw new Error(
      `Training failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  log.info(
    `Trained ${model.modelType}/${model.engine}: log-loss=${model.trainLogLoss.toFixed(4)} accuracy=${(model.trainAccuracy * 100).toFixed(1)}% in ${model.durationMs}ms`,
  );

  const results = await selected.engine.predict({ model, rows: trainingRows });

  await prisma.baselinePrediction.deleteMany({
    where: { courseId: course.id, modelType: model.modelType },
  });
  await persistResults(prisma, results);

  const dist = countRiskClasses(results);
  const warnings: string[] = [...selected.warnings, ...model.warnings];
  if (model.trainAccuracy < 0.6) {
    warnings.push(
      `Training accuracy is low (${(model.trainAccuracy * 100).toFixed(1)}%). The baseline may be poorly calibrated on this cohort.`,
    );
  }

  return {
    courseCode,
    courseId: course.id,
    engineRequested: selected.requestedName,
    engineResolved: selected.resolvedName,
    engineWarnings: selected.warnings,
    modelType: model.modelType,
    sampleSize: model.sampleSize,
    threshold: model.threshold,
    trainLogLoss: round4(model.trainLogLoss),
    trainAccuracy: round4(model.trainAccuracy),
    rowsWritten: results.length,
    riskDistribution: dist,
    durationMs: Date.now() - startedAt,
    warnings,
  };
}

async function persistResults(
  prisma: PrismaClient,
  results: ReadonlyArray<PredictionResult>,
): Promise<void> {
  for (const r of results) {
    await prisma.baselinePrediction.create({
      data: {
        studentId: r.studentId,
        courseId: r.courseId,
        modelType: r.modelType,
        predictedRiskProb: r.predictedRiskProb,
        predictedGrade: r.predictedGrade,
        riskClass: r.riskClass,
        predictionConfidence: r.confidence,
        threshold: r.threshold,
        featureImportanceJson: JSON.stringify(r.featureImportance),
        notesJson: JSON.stringify({ notes: r.notes, warnings: r.warnings }),
      },
    });
  }
}

function countRiskClasses(
  results: ReadonlyArray<PredictionResult>,
): { atRisk: number; borderline: number; onTrack: number } {
  const out = { atRisk: 0, borderline: 0, onTrack: 0 };
  for (const r of results) {
    if (r.riskClass === "at-risk") out.atRisk++;
    else if (r.riskClass === "borderline") out.borderline++;
    else out.onTrack++;
  }
  return out;
}

function round4(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 10000) / 10000;
}
