/**
 * Phase 6 — uploaded-CSV pipeline shared types.
 *
 * All shapes are JSON-serialisable (no Date instances, no Buffers). Server
 * actions return these straight to React; converting `Date` to ISO strings
 * here keeps the client/server contract explicit.
 */

export type ImportMode = "append" | "replace";

export interface PreviewStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  distinctStudents: number;
  distinctCourses: number;
}

export interface PreviewError {
  rowNumber: number;
  field: string;
  message: string;
  rawValue: string | null;
}

export interface PreviewSampleRow {
  studentId: string;
  courseId: string;
  weekNumber: number;
  resourceId: string;
  resourceType: string;
  activityType: string;
  timestamp: string;
  durationSeconds: number;
  quizScore: number | null;
  forumPosts: number;
  priorGpa: number;
  finalGrade: number;
}

export interface PreviewResult {
  ok: boolean;
  filename: string;
  byteSize: number;
  stats: PreviewStats;
  sampleRows: PreviewSampleRow[];
  errors: PreviewError[];
  /** Hard error that prevented previewing (parse failure, empty file, …). */
  error: string | null;
}

export interface CommitOptions {
  mode: ImportMode;
  dryRun: boolean;
  rerunCausalEstimates: boolean;
  rerunInterventionSimulations: boolean;
  /** Course code used for causal estimate + simulation runs. Falls back to the
   *  first course in the uploaded CSV when omitted. */
  courseCode?: string;
}

export interface CommitDerivedSummary {
  weeklySummaries: number;
  rdiScores: number;
  durationMs: number;
}

export interface CommitFeaturesSummary {
  rowsWritten: number;
  durationMs: number;
}

export interface CommitCausalEstimatesSummary {
  estimatesWritten: number;
  durationMs: number;
}

export interface CommitSimulationsSummary {
  simulationsWritten: number;
  studentsProcessed: number;
  durationMs: number;
}

export interface CommitIngestSummary {
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  students: number;
  courses: number;
  resources: number;
  enrollments: number;
  activityLogs: number;
  grades: number;
  durationMs: number;
}

export interface CommitResult {
  ok: boolean;
  filename: string;
  byteSize: number;
  mode: ImportMode;
  dryRun: boolean;
  stats: PreviewStats;
  errors: PreviewError[];
  ingest: CommitIngestSummary | null;
  derived: CommitDerivedSummary | null;
  features: CommitFeaturesSummary | null;
  causalEstimates: CommitCausalEstimatesSummary | null;
  simulations: CommitSimulationsSummary | null;
  syncLogId: string | null;
  warnings: string[];
  error: string | null;
}
