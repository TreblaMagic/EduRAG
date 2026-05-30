/**
 * Phase 6 — upload commit orchestrator.
 *
 * Single entry point for the "real" import path. Reuses every component of
 * the Phase 2-4 pipeline:
 *   - `ingestValidatedRows` writes the raw catalogue + ActivityLog.
 *   - `deriveAllSummaries` recomputes `WeeklyEngagementSummary` + `RdiScore`.
 *   - `deriveCourseFeatures` recomputes `CourseFeatureSummary`.
 *   - `runCausalEstimates` re-fits cohort-level β + refutations (optional).
 *   - `runSimulations` re-ranks per-student interventions (optional).
 *
 * Every committed run writes one `SyncLog` row with `source: "uploaded"` so
 * the Phase 5.5 integration page recognises it without additional plumbing.
 */

import type { PrismaClient } from "@prisma/client";

import { log } from "@/lib/logger";
import { deriveCourseFeatures } from "@/server/causal/derive-features";
import { runCausalEstimates } from "@/server/causal/run-estimates";
import { runSimulations } from "@/server/causal/run-simulations";
import { deriveAllSummaries } from "@/server/ingest/derive-summaries";
import { ingestValidatedRows } from "@/server/ingest/ingest-csv";
import type { ValidatedRow, ValidationError } from "@/server/ingest/row-schema";
import { buildPreviewResult, summariseValidated } from "./preview";
import { capErrors } from "./preview";
import type {
  CommitCausalEstimatesSummary,
  CommitDerivedSummary,
  CommitFeaturesSummary,
  CommitIngestSummary,
  CommitOptions,
  CommitResult,
  CommitSimulationsSummary,
} from "./types";

interface CommitInputs {
  filename: string;
  byteSize: number;
  rows: ValidatedRow[];
  errors: ValidationError[];
  options: CommitOptions;
}

const SOURCE = "uploaded";

export async function commitUploadedRows(
  prisma: PrismaClient,
  inputs: CommitInputs,
): Promise<CommitResult> {
  const startedAtMs = Date.now();
  const { filename, byteSize, rows, errors, options } = inputs;

  const preview = buildPreviewResult({ filename, byteSize, rows, errors });
  const warnings: string[] = [];

  if (!preview.ok) {
    return failed(filename, byteSize, options, errors, preview.error ?? "No valid rows.");
  }

  // ---- Dry run: report stats, skip every write -----------------------------
  if (options.dryRun) {
    return {
      ok: true,
      filename,
      byteSize,
      mode: options.mode,
      dryRun: true,
      stats: preview.stats,
      errors: capErrors(errors),
      ingest: null,
      derived: null,
      features: null,
      causalEstimates: null,
      simulations: null,
      syncLogId: null,
      warnings: ["Dry run: no records were written."],
      error: null,
    };
  }

  // ---- Replace mode: wipe LMS-derived tables -------------------------------
  if (options.mode === "replace") {
    await wipeLmsDerivedTables(prisma);
    warnings.push(
      "Replace mode: all LMS-derived tables were cleared before import (SyncLog audit history preserved).",
    );
  }

  // ---- Ingest --------------------------------------------------------------
  let ingestSummary: Awaited<ReturnType<typeof ingestValidatedRows>>;
  try {
    ingestSummary = await ingestValidatedRows(rows, errors.length, prisma);
  } catch (e) {
    return failed(
      filename,
      byteSize,
      options,
      errors,
      e instanceof Error ? `Ingest failed: ${e.message}` : "Ingest failed.",
    );
  }
  log.info("upload ingest:", ingestSummary);

  // ---- Re-derive weekly + RDI + course features ----------------------------
  let derived: CommitDerivedSummary | null = null;
  let features: CommitFeaturesSummary | null = null;
  try {
    const weekly = await deriveAllSummaries(prisma);
    derived = {
      weeklySummaries: weekly.weeklySummaries,
      rdiScores: weekly.rdiScores,
      durationMs: weekly.durationMs,
    };
    const f = await deriveCourseFeatures(prisma);
    features = { rowsWritten: f.rowsWritten, durationMs: f.durationMs };
  } catch (e) {
    warnings.push(
      e instanceof Error
        ? `Derivation failed after ingest: ${e.message}`
        : "Derivation failed after ingest.",
    );
  }

  // ---- Optional causal estimate re-run -------------------------------------
  let causalEstimates: CommitCausalEstimatesSummary | null = null;
  const courseCode = options.courseCode ?? rows[0]?.courseId;
  if (options.rerunCausalEstimates) {
    if (!courseCode) {
      warnings.push("Causal estimates skipped: no course code derivable from the upload.");
    } else {
      try {
        const r = await runCausalEstimates(prisma, courseCode);
        causalEstimates = { estimatesWritten: r.estimatesWritten, durationMs: r.durationMs };
      } catch (e) {
        warnings.push(
          e instanceof Error
            ? `Causal estimates failed: ${e.message}`
            : "Causal estimates failed.",
        );
      }
    }
  }

  // ---- Optional intervention simulation re-run -----------------------------
  let simulations: CommitSimulationsSummary | null = null;
  if (options.rerunInterventionSimulations) {
    if (!courseCode) {
      warnings.push("Simulations skipped: no course code derivable from the upload.");
    } else {
      try {
        const r = await runSimulations(prisma, { courseCode });
        simulations = {
          simulationsWritten: r.simulationsWritten,
          studentsProcessed: r.studentsProcessed,
          durationMs: r.durationMs,
        };
      } catch (e) {
        warnings.push(
          e instanceof Error ? `Simulations failed: ${e.message}` : "Simulations failed.",
        );
      }
    }
  }

  // ---- Persist SyncLog -----------------------------------------------------
  const finishedAtMs = Date.now();
  const summaryJson = {
    ingest: toIngestSummary(ingestSummary),
    derived,
    features,
    causalEstimates,
    simulations,
    filename,
    byteSize,
    invalidRows: errors.length,
  };
  const status = warnings.length === 0 ? "success" : "partial";
  const syncLog = await prisma.syncLog.create({
    data: {
      source: SOURCE,
      status,
      startedAt: new Date(startedAtMs),
      finishedAt: new Date(finishedAtMs),
      durationMs: finishedAtMs - startedAtMs,
      scopeJson: JSON.stringify([options.mode]),
      summaryJson: JSON.stringify(summaryJson),
      message: buildSyncLogMessage(filename, options, status, warnings),
    },
  });

  return {
    ok: true,
    filename,
    byteSize,
    mode: options.mode,
    dryRun: false,
    stats: summariseValidated(rows, errors.length),
    errors: capErrors(errors),
    ingest: toIngestSummary(ingestSummary),
    derived,
    features,
    causalEstimates,
    simulations,
    syncLogId: syncLog.id,
    warnings,
    error: null,
  };
}

// ---- internals -------------------------------------------------------------

function toIngestSummary(s: Awaited<ReturnType<typeof ingestValidatedRows>>): CommitIngestSummary {
  return {
    rowsRead: s.rowsRead,
    rowsValid: s.rowsValid,
    rowsInvalid: s.rowsInvalid,
    students: s.students,
    courses: s.courses,
    resources: s.resources,
    enrollments: s.enrollments,
    activityLogs: s.activityLogs,
    grades: s.grades,
    durationMs: s.durationMs,
  };
}

/**
 * Wipe every LMS-derived table in dependency order so cascades don't
 * complicate things. Preserves `SyncLog` (audit history) and the schema
 * itself.
 */
async function wipeLmsDerivedTables(prisma: PrismaClient): Promise<void> {
  await prisma.interventionSimulation.deleteMany({});
  await prisma.causalEstimate.deleteMany({});
  await prisma.courseFeatureSummary.deleteMany({});
  await prisma.rdiScore.deleteMany({});
  await prisma.weeklyEngagementSummary.deleteMany({});
  await prisma.advisorNote.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.resource.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.course.deleteMany({});
}

function buildSyncLogMessage(
  filename: string,
  options: CommitOptions,
  status: "success" | "partial",
  warnings: string[],
): string {
  const parts = [`Uploaded ${filename}`, `mode=${options.mode}`];
  if (options.rerunCausalEstimates) parts.push("with causal estimates");
  if (options.rerunInterventionSimulations) parts.push("with simulations");
  if (status === "partial") parts.push(`(${warnings.length} warning${warnings.length === 1 ? "" : "s"})`);
  return parts.join(", ");
}

function failed(
  filename: string,
  byteSize: number,
  options: CommitOptions,
  errors: ValidationError[],
  message: string,
): CommitResult {
  return {
    ok: false,
    filename,
    byteSize,
    mode: options.mode,
    dryRun: options.dryRun,
    stats: summariseValidated([], errors.length),
    errors: capErrors(errors),
    ingest: null,
    derived: null,
    features: null,
    causalEstimates: null,
    simulations: null,
    syncLogId: null,
    warnings: [],
    error: message,
  };
}
