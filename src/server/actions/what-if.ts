"use server";

/**
 * What-if simulator — server action invoked by the `/what-if` page.
 *
 * Reuses the pure `simulateIntervention()` from Phase 4 — never duplicates
 * the projection math. Loads the relevant course feature table + causal
 * estimate + cohort stats from Prisma and hands them to the simulator.
 *
 * Does NOT persist. Persistence is the job of `npm run causal:simulate`;
 * the UI surface is read-only-on-the-database.
 */

import {
  STANDARD_INTERVENTIONS,
  buildFeatureTable,
  computeCohortStats,
  simulateIntervention,
  type CausalEstimateSummary,
  type CausalNode,
  type SimulatedIntervention,
} from "@/features/causal-engine";
import { prisma } from "@/lib/db";

import { confidenceForRefutationJson } from "../queries/shared";

export interface RunWhatIfInput {
  studentExternalId: string;
  interventionName: string;
  customDelta?: number;
}

export type RunWhatIfResult =
  | { ok: true; simulation: SimulatedIntervention; intervention: { label: string; actionHint: string } }
  | { ok: false; error: string };

export async function runWhatIf(input: RunWhatIfInput): Promise<RunWhatIfResult> {
  try {
    const intervention = STANDARD_INTERVENTIONS.find((i) => i.name === input.interventionName);
    if (!intervention) {
      return { ok: false, error: `Unknown intervention: ${input.interventionName}` };
    }

    const student = await prisma.student.findUnique({
      where: { externalId: input.studentExternalId },
    });
    if (!student) {
      return { ok: false, error: `Student not found: ${input.studentExternalId}` };
    }

    const courseFeature = await prisma.courseFeatureSummary.findFirst({
      where: { studentId: student.id },
      select: { courseId: true },
    });
    if (!courseFeature) {
      return {
        ok: false,
        error:
          "No CourseFeatureSummary row for this student yet. Run `npm run db:ingest` first.",
      };
    }

    const allRows = await buildFeatureTable(prisma, courseFeature.courseId);
    const studentRow = allRows.find((r) => r.studentId === student.id);
    if (!studentRow) {
      return {
        ok: false,
        error: "Student has no Grade row yet — re-run `npm run db:ingest`.",
      };
    }

    const estimateRow = await prisma.causalEstimate.findFirst({
      where: {
        courseId: courseFeature.courseId,
        treatment: intervention.treatment,
        outcome: "FinalGrade",
      },
    });
    if (!estimateRow) {
      return {
        ok: false,
        error:
          "No causal estimate for this treatment yet. Run `npm run causal:estimate` first.",
      };
    }

    const confidence = confidenceForRefutationJson(estimateRow.refutationJson);
    const summary: CausalEstimateSummary = {
      treatment: estimateRow.treatment as CausalNode,
      outcome: estimateRow.outcome as CausalNode,
      estimate: estimateRow.estimate,
      ciLow: estimateRow.ciLow,
      ciHigh: estimateRow.ciHigh,
      refutationPassesAll: confidence === "high",
      refutationPassesAny: confidence !== "low",
    };

    const stats = computeCohortStats(allRows);

    const proposal =
      input.customDelta !== undefined && Number.isFinite(input.customDelta)
        ? { ...intervention, delta: input.customDelta }
        : intervention;

    const simulation = simulateIntervention(studentRow, proposal, summary, stats);

    return {
      ok: true,
      simulation,
      intervention: { label: intervention.label, actionHint: intervention.actionHint },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error in runWhatIf",
    };
  }
}
