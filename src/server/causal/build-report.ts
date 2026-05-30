/**
 * Phase 7 — assemble a downloadable causal report for one course.
 *
 * Reads the persisted `CausalEstimate` rows produced by `run-estimates.ts`
 * (so reports always reflect what is actually in the database), pairs them
 * with the manually-encoded DAG, optionally appends a freshly-run causal
 * discovery comparison, and returns a {@link CausalReport} payload ready
 * to be serialised to Markdown or JSON.
 */

import type { PrismaClient } from "@prisma/client";

import {
  buildFeatureTable,
  CAUSAL_EDGES,
  toDagJson,
  type CausalNode,
  type CausalReport,
  type EngineName,
  type ExtendedRefutationResult,
  type RefutationResult,
  type ReportDatasetModeSection,
  type ReportDiscoveryComparison,
  type ReportEstimate,
  type ReportPredictionRow,
  type ReportPredictionSection,
  type ReportTrackingRow,
  type ReportTrackingSection,
} from "../../features/causal-engine";
import { confidenceForRefutationJson } from "../queries/shared";
import { runCausalDiscovery } from "./run-discovery";
import { getDatasetModeOverview } from "../dataset-mode";
import {
  getCohortAnalytics,
  getRecentDecisions,
} from "../intervention-tracking";
import { getPredictionsForCourse } from "../queries/predictions";

export interface BuildReportOptions {
  includeDiscovery?: boolean;
  discoveryEngine?: EngineName;
  alpha?: number;
  /** Phase 8 — include the baseline prediction comparison section. */
  includePrediction?: boolean;
  /** Phase 11 — include the intervention tracking summary section. */
  includeTracking?: boolean;
}

export async function buildCausalReport(
  prisma: PrismaClient,
  courseCode: string,
  options: BuildReportOptions = {},
): Promise<CausalReport> {
  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) throw new Error(`Course not found: ${courseCode}`);

  const rows = await buildFeatureTable(prisma, course.id);
  if (rows.length === 0) {
    throw new Error(
      `No feature rows for course ${courseCode}. Run \`npm run db:ingest\` first.`,
    );
  }
  const outcomeValues = rows.map((r) => r.features.FinalGrade);
  const meanOutcome = avg(outcomeValues);
  const stdOutcome = std(outcomeValues, meanOutcome);

  const estimatesDb = await prisma.causalEstimate.findMany({
    where: { courseId: course.id, outcome: "FinalGrade" },
    orderBy: { treatment: "asc" },
  });

  const warnings: string[] = [];
  if (estimatesDb.length === 0) {
    warnings.push(
      "No CausalEstimate rows found for this course. Run `npm run causal:estimate` to populate the report.",
    );
  }

  const estimates: ReportEstimate[] = estimatesDb.map((e) => {
    const ref = parseRefutationJson(e.refutationJson);
    const notes = parseNotesJson(e.notesJson);
    return {
      treatment: e.treatment as CausalNode,
      adjustmentSet: parseAdjustmentSet(e.adjustmentSet),
      estimate: e.estimate,
      ciLow: e.ciLow,
      ciHigh: e.ciHigh,
      ciLevel: e.ciLevel,
      method: e.method,
      engine: (notes.engine as EngineName) ?? "baseline",
      bootstrapIters: e.bootstrapIters,
      refutations: ref.baseline,
      extendedRefutations: ref.extended,
      confidence: confidenceForRefutationJson(e.refutationJson),
      warnings: notes.warnings ?? [],
    };
  });

  let discovery: ReportDiscoveryComparison | null = null;
  if (options.includeDiscovery) {
    try {
      const d = await runCausalDiscovery(prisma, courseCode, {
        engine: options.discoveryEngine,
        alpha: options.alpha,
      });
      discovery = {
        algorithm: d.algorithm,
        alpha: d.alpha,
        edges: d.edges,
        manualOnly: d.diff.manualOnly,
        discoveredOnly: d.diff.discoveredOnly,
        shared: d.diff.shared,
        warnings: d.warnings,
        engine: d.engineResolved,
      };
    } catch (e) {
      warnings.push(
        `Causal discovery failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  let prediction: ReportPredictionSection | null = null;
  if (options.includePrediction) {
    try {
      prediction = await buildPredictionSection(prisma, courseCode, course.id);
      if (prediction === null) {
        warnings.push(
          "Prediction section requested but no BaselinePrediction rows exist. Run `npm run ml:predict` first.",
        );
      }
    } catch (e) {
      warnings.push(
        `Prediction section failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Phase 11 — intervention tracking summary (optional).
  let tracking: ReportTrackingSection | null = null;
  if (options.includeTracking) {
    try {
      tracking = await buildTrackingSection(prisma);
    } catch (e) {
      warnings.push(
        `Tracking section failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const engineUsed = (estimates[0]?.engine ?? "baseline") as EngineName;

  // Phase 10 — stamp every report with the currently-active dataset mode.
  let datasetMode: ReportDatasetModeSection | null = null;
  try {
    const ov = await getDatasetModeOverview(prisma);
    const snap = ov.snapshots.find((s) => s.metadata.id === ov.activeMode);
    datasetMode = {
      id: ov.activeMetadata.id,
      name: ov.activeMetadata.name,
      verb: ov.activeMetadata.verb,
      description: ov.activeMetadata.description,
      lastUpdatedAt: snap?.lastUpdatedAt ?? null,
      lastUpdatedDetail: snap?.lastUpdatedDetail ?? null,
    };
  } catch {
    // Mode store unreadable — leave provenance null rather than failing the report.
  }

  return {
    generatedAt: new Date().toISOString(),
    generator: "EduRAG",
    schemaVersion: tracking ? "phase-11.v1" : "phase-10.v1",
    engine: engineUsed,
    cohort: {
      courseCode,
      sampleSize: rows.length,
      outcome: "FinalGrade",
      meanOutcome: round4(meanOutcome),
      stdOutcome: round4(stdOutcome),
    },
    datasetMode,
    dag: toDagJson(),
    estimates,
    discovery,
    prediction,
    tracking,
    limitations: [
      "Estimates are model-based, not causal proof.",
      "The manually-encoded DAG is a hypothesis, not a discovered truth.",
      "Linear functional form; non-linear and interaction effects are not captured.",
      "Discovery results assume linear / Gaussian-noise relationships and are sample-size sensitive.",
      ...(prediction
        ? [
            "Baseline predictions are probabilistic; feature importance is not the same thing as causal effect.",
          ]
        : []),
    ],
    warnings,
  };
}

async function buildPredictionSection(
  prisma: PrismaClient,
  courseCode: string,
  courseId: string,
): Promise<ReportPredictionSection | null> {
  const predictions = await getPredictionsForCourse(courseCode, prisma);
  if (predictions.length === 0) return null;

  const interventionRows = await prisma.interventionSimulation.findMany({
    where: { courseId },
    orderBy: [{ studentId: "asc" }, { rankScore: "desc" }],
    include: { student: { select: { externalId: true } } },
  });
  const topInterventionByStudent = new Map<
    string,
    {
      interventionName: string;
      treatment: string;
      projectedGain: number;
      confidence: "high" | "medium" | "low";
    }
  >();
  for (const r of interventionRows) {
    if (topInterventionByStudent.has(r.student.externalId)) continue;
    topInterventionByStudent.set(r.student.externalId, {
      interventionName: r.interventionName,
      treatment: r.treatment,
      projectedGain: r.projectedGrade - r.baselineGrade,
      confidence: r.confidence as "high" | "medium" | "low",
    });
  }

  const featureToTreatment: Record<string, string> = {
    MeanRdi: "ResourceDiversityIndex",
    ForumParticipation: "ForumParticipation",
    QuizConsistency: "QuizConsistency",
    AssessmentTrend: "AssessmentTrend",
  };

  const rows: ReportPredictionRow[] = predictions.map((p) => {
    const topPredictor = p.featureImportance[0] ?? null;
    const topIntervention = topInterventionByStudent.get(p.studentExternalId) ?? null;
    let agreesOnLever: boolean | null = null;
    if (topPredictor && topIntervention) {
      agreesOnLever =
        featureToTreatment[topPredictor.feature] === topIntervention.treatment;
    }
    return {
      studentExternalId: p.studentExternalId,
      predictedRiskProb: p.predictedRiskProb,
      riskClass: p.riskClass,
      topPredictor: topPredictor
        ? { feature: topPredictor.feature, value: topPredictor.value }
        : null,
      topIntervention,
      agreesOnLever,
    };
  });

  const dist = { atRisk: 0, borderline: 0, onTrack: 0 };
  for (const p of predictions) {
    if (p.riskClass === "at-risk") dist.atRisk++;
    else if (p.riskClass === "borderline") dist.borderline++;
    else dist.onTrack++;
  }

  const agreement = rows.filter((r) => r.agreesOnLever === true).length;
  const disagreement = rows.filter((r) => r.agreesOnLever === false).length;

  const first = predictions[0]!;
  return {
    modelType: first.modelType,
    threshold: first.threshold,
    trainLogLoss: Number.NaN,
    trainAccuracy: Number.NaN,
    riskDistribution: dist,
    agreementCount: agreement,
    disagreementCount: disagreement,
    rows,
    notes: [
      "Predictions are probabilistic — see the per-row P(at-risk) column.",
      "Feature importance is the standardised coefficient β from the logistic baseline; it summarises predictive contribution, not causal effect.",
      "Agreement counts how often the strongest predictor matches the top causal intervention's treatment target.",
    ],
    warnings: [],
  };
}

function parseRefutationJson(json: string | null): {
  baseline: RefutationResult;
  extended: ExtendedRefutationResult | null;
} {
  if (!json) return { baseline: emptyRefutations(), extended: null };
  try {
    const parsed = JSON.parse(json) as RefutationResult & {
      extended?: ExtendedRefutationResult;
    };
    const { extended, ...baseline } = parsed;
    return { baseline: baseline as RefutationResult, extended: extended ?? null };
  } catch {
    return { baseline: emptyRefutations(), extended: null };
  }
}

function parseNotesJson(json: string | null): {
  engine?: string;
  notes?: string[];
  warnings?: string[];
  limitations?: string[];
} {
  if (!json) return {};
  try {
    return JSON.parse(json) as ReturnType<typeof parseNotesJson>;
  } catch {
    return {};
  }
}

function parseAdjustmentSet(json: string): CausalNode[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as CausalNode[];
    }
  } catch {
    // fall through
  }
  return [];
}

function emptyRefutations(): RefutationResult {
  return {
    placebo: {
      description: "",
      originalEstimate: 0,
      placeboEstimate: 0,
      ratio: 0,
      threshold: 0,
      passes: false,
    },
    randomCommonCause: {
      description: "",
      originalEstimate: 0,
      adjustedEstimate: 0,
      absChange: 0,
      relativeChange: 0,
      threshold: 0,
      passes: false,
    },
  };
}

function avg(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: ReadonlyArray<number>, mean: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) * (x - mean);
  return Math.sqrt(s / (xs.length - 1));
}

function round4(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 10000) / 10000;
}

// Phase 11 — assemble the intervention tracking summary used by the report.
async function buildTrackingSection(prisma: PrismaClient): Promise<ReportTrackingSection> {
  const [analytics, recent] = await Promise.all([
    getCohortAnalytics(prisma),
    getRecentDecisions(prisma, 15),
  ]);

  const recentDecisions: ReportTrackingRow[] = recent.map((r) => ({
    studentExternalId: r.studentExternalId,
    interventionName: r.interventionName,
    treatment: r.treatment,
    status: r.status as ReportTrackingRow["status"],
    advisorNote: r.advisorNote,
    followUpObserved: r.followUpObserved,
    followUpOutcome: null,
    updatedAt: r.updatedAt,
  }));

  return {
    totalRecommendations: analytics.totalRecommendations,
    decisionCounts: analytics.decisionCounts,
    proposedCount: analytics.proposedCount,
    followUpsRecorded: analytics.followUpsRecorded,
    observationalInsights: analytics.observationalInsights,
    recentDecisions,
    notes: [
      "All decisions are advisor-supplied; the dashboard never records a decision automatically.",
      "Follow-up outcomes are observational. They do not validate the causal model or confirm the projected lift materialised.",
    ],
  };
}
