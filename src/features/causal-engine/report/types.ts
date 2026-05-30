/**
 * Phase 7 — causal report payload.
 *
 * Single canonical shape that drives both the Markdown and JSON
 * downloadable reports. Reflects an entire course-level causal run:
 * cohort summary, treatment estimates with CIs, refutation outcomes,
 * the DAG snapshot (manual + optional discovered), warnings, and
 * provenance metadata.
 */

import type { CausalNode, DagJson } from "../dag";
import type { EngineName } from "../engine/types";
import type { ExtendedRefutationResult } from "../refutation-extended";
import type { RefutationResult } from "../refutation";

export interface ReportCohortSummary {
  courseCode: string;
  sampleSize: number;
  outcome: CausalNode;
  meanOutcome: number;
  stdOutcome: number;
}

export interface ReportEstimate {
  treatment: CausalNode;
  adjustmentSet: CausalNode[];
  estimate: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  method: string;
  engine: EngineName;
  bootstrapIters: number;
  refutations: RefutationResult;
  extendedRefutations: ExtendedRefutationResult | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface ReportDiscoveryComparison {
  algorithm: string;
  alpha: number;
  edges: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  manualOnly: Array<{ from: CausalNode; to: CausalNode }>;
  discoveredOnly: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  shared: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  warnings: string[];
  engine: EngineName;
}

/** Phase 8 — optional baseline-prediction layer included in the report. */
export interface ReportPredictionRow {
  studentExternalId: string;
  predictedRiskProb: number;
  riskClass: "at-risk" | "borderline" | "on-track";
  topPredictor: { feature: string; value: number } | null;
  topIntervention: {
    interventionName: string;
    treatment: string;
    projectedGain: number;
    confidence: "high" | "medium" | "low";
  } | null;
  agreesOnLever: boolean | null;
}

export interface ReportPredictionSection {
  modelType: string;
  threshold: number;
  trainLogLoss: number;
  trainAccuracy: number;
  riskDistribution: { atRisk: number; borderline: number; onTrack: number };
  agreementCount: number;
  disagreementCount: number;
  rows: ReportPredictionRow[];
  notes: string[];
  warnings: string[];
}

/** Phase 10 — dataset-mode provenance stamp on every report. */
export interface ReportDatasetModeSection {
  /** Mode id — "synthetic" | "shell-university" | "uploaded". */
  id: string;
  /** Human-friendly name ("Synthetic Demo Dataset"). */
  name: string;
  /** Verb describing how data arrived ("Generated" | "Synced" | "Uploaded"). */
  verb: string;
  /** Paragraph-length description. */
  description: string;
  /** ISO timestamp of the most-recent activity for this mode (or null). */
  lastUpdatedAt: string | null;
  /** Human-readable last-update detail. */
  lastUpdatedDetail: string | null;
}

/** Phase 11 — intervention tracking summary appended to the report. */
export interface ReportTrackingRow {
  studentExternalId: string;
  interventionName: string;
  treatment: string;
  status: "accepted" | "rejected" | "deferred" | "completed";
  advisorNote: string | null;
  followUpObserved: boolean;
  followUpOutcome: string | null;
  updatedAt: string;
}

export interface ReportTrackingSection {
  totalRecommendations: number;
  decisionCounts: Record<"accepted" | "rejected" | "deferred" | "completed", number>;
  proposedCount: number;
  followUpsRecorded: number;
  observationalInsights: string[];
  recentDecisions: ReportTrackingRow[];
  notes: string[];
}

export interface CausalReport {
  generatedAt: string;
  generator: "EduRAG";
  /** Bumps each phase the schema grows. */
  schemaVersion: "phase-7.v1" | "phase-8.v1" | "phase-10.v1" | "phase-11.v1";
  engine: EngineName;
  cohort: ReportCohortSummary;
  /** Phase 10 — provenance: which dataset mode produced the rows. */
  datasetMode: ReportDatasetModeSection | null;
  dag: DagJson;
  estimates: ReportEstimate[];
  discovery: ReportDiscoveryComparison | null;
  /** Phase 8 — optional. */
  prediction: ReportPredictionSection | null;
  /** Phase 11 — optional intervention tracking summary. */
  tracking: ReportTrackingSection | null;
  limitations: string[];
  warnings: string[];
}
