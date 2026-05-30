/**
 * Orchestrate causal estimates for one course.
 *
 * For each behavioural treatment in {RDI, ForumParticipation,
 * QuizConsistency, AssessmentTrend} → FinalGrade:
 *   1. Build the feature table from persisted `CourseFeatureSummary`.
 *   2. Estimate β_T via the selected engine (baseline or advanced).
 *   3. Run baseline refutation checks (placebo + random common cause).
 *   4. Optionally run extended refutations (subset robustness, bootstrap
 *      stability, adjustment-set sensitivity, outcome permutation).
 *   5. Upsert a `CausalEstimate` row with provenance + limitations.
 *
 * Cohort-level only — per-student counterfactuals are Phase 4
 * (`InterventionSimulation`). Engine choice is captured in the persisted
 * `method` field so reviewers can tell which engine produced which row.
 */

import type { PrismaClient } from "@prisma/client";

import {
  adjustmentSetFor,
  buildFeatureTable,
  runExtendedRefutations,
  runRefutations,
  selectEngine,
  type CausalNode,
  type EngineEstimateResult,
  type EngineName,
  type ExtendedRefutationResult,
  type FeatureRow,
  type RefutationResult,
} from "../../features/causal-engine";
import { log } from "../../lib/logger";

const TREATMENTS: readonly CausalNode[] = [
  "ResourceDiversityIndex",
  "ForumParticipation",
  "QuizConsistency",
  "AssessmentTrend",
];
const OUTCOME: CausalNode = "FinalGrade";

export interface RunEstimatesSummary {
  courseCode: string;
  courseId: string;
  sampleSize: number;
  engineRequested: EngineName;
  engineResolved: EngineName;
  engineWarnings: string[];
  extendedRefutationsRun: boolean;
  estimatesWritten: number;
  results: Array<{
    treatment: CausalNode;
    estimate: number;
    ciLow: number;
    ciHigh: number;
    method: string;
    engine: EngineName;
    placeboPasses: boolean;
    randomCommonCausePasses: boolean;
    subsetRobustnessPasses: boolean | null;
    bootstrapStabilityPasses: boolean | null;
    sensitivityPasses: boolean | null;
    outcomePermutationPasses: boolean | null;
  }>;
  durationMs: number;
}

export interface RunEstimatesOptions {
  engine?: EngineName;
  extendedRefutations?: boolean;
}

const MIN_SAMPLE_SIZE = 10;

export async function runCausalEstimates(
  prisma: PrismaClient,
  courseCode: string,
  options: RunEstimatesOptions = {},
): Promise<RunEstimatesSummary> {
  const startedAt = Date.now();
  const engineName = options.engine ?? "baseline";
  const extended = options.extendedRefutations ?? false;

  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) throw new Error(`Course not found: ${courseCode}`);

  const rows = await buildFeatureTable(prisma, course.id);
  if (rows.length < MIN_SAMPLE_SIZE) {
    throw new Error(
      `Too few observations for course ${courseCode}: ${rows.length} (need ≥ ${MIN_SAMPLE_SIZE}). ` +
        `Did you run \`npm run db:ingest\` first?`,
    );
  }
  log.info(
    `Built feature table: ${rows.length} students × 7 features for course ${courseCode}`,
  );

  const selected = await selectEngine(engineName);
  for (const w of selected.warnings) log.warn(w);

  await prisma.causalEstimate.deleteMany({ where: { courseId: course.id } });

  const results: RunEstimatesSummary["results"] = [];

  for (const treatment of TREATMENTS) {
    const adjustment = adjustmentSetFor(treatment);
    const estimate = await selected.engine.estimate({
      treatment,
      outcome: OUTCOME,
      adjustmentSet: adjustment,
      rows,
    });
    const refutations = runRefutations(rows, treatment, OUTCOME, estimate.estimate);
    const extendedRefutations = extended
      ? runExtendedRefutations(rows, treatment, OUTCOME, estimate.estimate)
      : null;

    logEstimate(treatment, estimate, refutations, extendedRefutations);
    await persistEstimate(prisma, course.id, estimate, refutations, extendedRefutations);

    results.push({
      treatment,
      estimate: estimate.estimate,
      ciLow: estimate.ciLow,
      ciHigh: estimate.ciHigh,
      method: estimate.method,
      engine: estimate.engine,
      placeboPasses: refutations.placebo.passes,
      randomCommonCausePasses: refutations.randomCommonCause.passes,
      subsetRobustnessPasses: extendedRefutations?.subsetRobustness.passes ?? null,
      bootstrapStabilityPasses:
        extendedRefutations?.bootstrapStability.passes ?? null,
      sensitivityPasses: extendedRefutations?.sensitivity.passes ?? null,
      outcomePermutationPasses:
        extendedRefutations?.outcomePermutation.passes ?? null,
    });
  }

  return {
    courseCode,
    courseId: course.id,
    sampleSize: rows.length,
    engineRequested: selected.requestedName,
    engineResolved: selected.resolvedName,
    engineWarnings: selected.warnings,
    extendedRefutationsRun: extended,
    estimatesWritten: results.length,
    results,
    durationMs: Date.now() - startedAt,
  };
}

function logEstimate(
  treatment: CausalNode,
  estimate: EngineEstimateResult,
  refutations: RefutationResult,
  extended: ExtendedRefutationResult | null,
): void {
  const placeboFlag = refutations.placebo.passes ? "PASS" : "FAIL";
  const rccFlag = refutations.randomCommonCause.passes ? "PASS" : "FAIL";
  const extras = extended
    ? ` subset=${extended.subsetRobustness.passes ? "PASS" : "FAIL"}` +
      ` bootstrap=${extended.bootstrapStability.passes ? "PASS" : "FAIL"}` +
      ` sens=${extended.sensitivity.passes ? "PASS" : "FAIL"}` +
      ` outcome=${extended.outcomePermutation.passes ? "PASS" : "FAIL"}`
    : "";
  log.info(
    `[${treatment}] (${estimate.engine}/${estimate.method}) β=${estimate.estimate.toFixed(3)} ` +
      `CI${Math.round(estimate.ciLevel * 100)}=[${estimate.ciLow.toFixed(3)}, ${estimate.ciHigh.toFixed(3)}] ` +
      `n=${estimate.sampleSize} placebo=${placeboFlag} rcc=${rccFlag}${extras}`,
  );
}

async function persistEstimate(
  prisma: PrismaClient,
  courseId: string,
  estimate: EngineEstimateResult,
  refutations: RefutationResult,
  extended: ExtendedRefutationResult | null,
): Promise<void> {
  await prisma.causalEstimate.create({
    data: {
      courseId,
      treatment: estimate.treatment,
      outcome: estimate.outcome,
      adjustmentSet: JSON.stringify(estimate.adjustmentSet),
      estimate: estimate.estimate,
      ciLow: estimate.ciLow,
      ciHigh: estimate.ciHigh,
      ciLevel: estimate.ciLevel,
      sampleSize: estimate.sampleSize,
      method: estimate.method,
      bootstrapIters: estimate.bootstrapIters,
      refutationJson: JSON.stringify({
        ...refutations,
        extended: extended ?? undefined,
      }),
      notesJson: JSON.stringify({
        engine: estimate.engine,
        notes: estimate.notes,
        warnings: estimate.warnings,
      }),
    },
  });
}

// Suppress unused-row warning if FeatureRow shape changes upstream.
export type _Row = FeatureRow;
