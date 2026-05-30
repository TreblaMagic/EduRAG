/**
 * Orchestrate intervention simulations for a course (or a single student).
 *
 * Pipeline:
 *   1. Resolve the course (by `code`).
 *   2. Load the feature table from `CourseFeatureSummary` + `Grade` + `Student`.
 *   3. Load this course's `CausalEstimate` rows, parsing refutation JSON
 *      into a `CausalEstimateSummary` map keyed by treatment.
 *   4. Compute cohort stats (always from the full cohort, even when the
 *      caller scoped to one student — the cohort defines "headroom").
 *   5. Delete only the simulation rows in scope (course-wide or
 *      single-student); never touch raw data or causal estimates.
 *   6. For each in-scope student, simulate every `STANDARD_INTERVENTIONS`
 *      entry that has a matching estimate, optionally truncate to top-N,
 *      and bulk-insert.
 */

import type { PrismaClient } from "@prisma/client";

import {
  STANDARD_INTERVENTIONS,
  buildFeatureTable,
  computeCohortStats,
  rankRecommendedInterventions,
  simulateMultipleInterventions,
  type CausalEstimateSummary,
  type CausalNode,
  type SimulatedIntervention,
} from "../../features/causal-engine";
import { log } from "../../lib/logger";

interface PersistedRefutation {
  placebo?: { passes?: boolean };
  randomCommonCause?: { passes?: boolean };
}

export interface RunSimulationsOptions {
  courseCode: string;
  studentExternalId?: string;
  topN?: number;
}

export interface RunSimulationsSummary {
  courseCode: string;
  courseId: string;
  cohortSize: number;
  studentsProcessed: number;
  simulationsWritten: number;
  perStudentAvg: number;
  durationMs: number;
}

const WRITE_BATCH_SIZE = 500;
const MIN_COHORT_SIZE = 10;

export async function runSimulations(
  prisma: PrismaClient,
  opts: RunSimulationsOptions,
): Promise<RunSimulationsSummary> {
  const startedAt = Date.now();

  const course = await prisma.course.findUnique({ where: { code: opts.courseCode } });
  if (!course) throw new Error(`Course not found: ${opts.courseCode}`);

  // --- Feature table & cohort scope -----------------------------------------
  const allRows = await buildFeatureTable(prisma, course.id);
  if (allRows.length < MIN_COHORT_SIZE) {
    throw new Error(
      `Too few CourseFeatureSummary rows for course ${opts.courseCode} (${allRows.length}, need ≥ ${MIN_COHORT_SIZE}). ` +
        `Did you run \`npm run db:ingest\` first?`,
    );
  }
  const cohortStats = computeCohortStats(allRows);

  let scopedStudentDbId: string | null = null;
  let rowsToSimulate = allRows;
  if (opts.studentExternalId) {
    const student = await prisma.student.findUnique({
      where: { externalId: opts.studentExternalId },
    });
    if (!student) {
      throw new Error(`Student not found: ${opts.studentExternalId}`);
    }
    scopedStudentDbId = student.id;
    rowsToSimulate = allRows.filter((r) => r.studentId === scopedStudentDbId);
    if (rowsToSimulate.length === 0) {
      throw new Error(
        `No CourseFeatureSummary row for student ${opts.studentExternalId} in course ${opts.courseCode}`,
      );
    }
  }

  // --- Causal estimates -----------------------------------------------------
  const causalEstimateRows = await prisma.causalEstimate.findMany({
    where: { courseId: course.id, outcome: "FinalGrade" },
  });
  if (causalEstimateRows.length === 0) {
    throw new Error(
      `No CausalEstimate rows for course ${opts.courseCode}. ` +
        `Run \`npm run causal:estimate -- --course ${opts.courseCode}\` first.`,
    );
  }
  const estimates = new Map<CausalNode, CausalEstimateSummary>();
  for (const r of causalEstimateRows) {
    const { placebo, rcc } = parseRefutationFlags(r.refutationJson);
    estimates.set(r.treatment as CausalNode, {
      treatment: r.treatment as CausalNode,
      outcome: r.outcome as CausalNode,
      estimate: r.estimate,
      ciLow: r.ciLow,
      ciHigh: r.ciHigh,
      refutationPassesAll: placebo && rcc,
      refutationPassesAny: placebo || rcc,
    });
  }

  // --- Wipe in-scope simulations only --------------------------------------
  await prisma.interventionSimulation.deleteMany({
    where: {
      courseId: course.id,
      ...(scopedStudentDbId ? { studentId: scopedStudentDbId } : {}),
    },
  });

  // --- Simulate -------------------------------------------------------------
  const allSims: SimulatedIntervention[] = [];
  for (const row of rowsToSimulate) {
    const sims = simulateMultipleInterventions(
      row,
      STANDARD_INTERVENTIONS,
      estimates,
      cohortStats,
    );
    const ranked = rankRecommendedInterventions(sims, opts.topN);
    allSims.push(...ranked);
  }
  log.info(
    `Simulated ${allSims.length} intervention rows for ${rowsToSimulate.length} student(s) ` +
      `(cohort=${allRows.length}, course=${opts.courseCode})`,
  );

  // --- Persist --------------------------------------------------------------
  const dataRows = allSims.map((s) => ({
    studentId: s.studentId,
    courseId: s.courseId,
    interventionName: s.interventionName,
    treatment: s.treatment,
    baselineValue: s.baselineValue,
    proposedValue: s.proposedValue,
    appliedDelta: s.appliedDelta,
    estimatedEffect: s.estimatedEffect,
    baselineGrade: s.baselineGrade,
    projectedGrade: s.projectedGrade,
    projectedLow: s.projectedLow,
    projectedHigh: s.projectedHigh,
    rankScore: s.rankScore,
    confidence: s.confidence,
    explanation: s.explanation,
    notesJson: JSON.stringify({
      assumptions: s.assumptions,
      headroom: s.headroom,
      weaknessScore: s.weaknessScore,
    }),
  }));

  for (let i = 0; i < dataRows.length; i += WRITE_BATCH_SIZE) {
    await prisma.interventionSimulation.createMany({
      data: dataRows.slice(i, i + WRITE_BATCH_SIZE),
    });
  }

  return {
    courseCode: opts.courseCode,
    courseId: course.id,
    cohortSize: allRows.length,
    studentsProcessed: rowsToSimulate.length,
    simulationsWritten: dataRows.length,
    perStudentAvg:
      rowsToSimulate.length > 0
        ? round2(dataRows.length / rowsToSimulate.length)
        : 0,
    durationMs: Date.now() - startedAt,
  };
}

function parseRefutationFlags(refutationJson: string | null): {
  placebo: boolean;
  rcc: boolean;
} {
  if (!refutationJson) return { placebo: false, rcc: false };
  try {
    const parsed = JSON.parse(refutationJson) as PersistedRefutation;
    return {
      placebo: Boolean(parsed.placebo?.passes),
      rcc: Boolean(parsed.randomCommonCause?.passes),
    };
  } catch {
    log.warn("Failed to parse refutationJson; treating refutations as failed");
    return { placebo: false, rcc: false };
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
