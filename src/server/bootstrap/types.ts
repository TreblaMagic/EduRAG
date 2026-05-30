/**
 * Phase 9 — bootstrap / setup primitives.
 *
 * Shared types used by the setup, demo, reset, doctor, and status CLIs.
 * Keeping these pure means the helpers can be unit-tested in isolation
 * (the rendering logic, the status aggregation, the step orchestrator)
 * without spawning processes or touching the filesystem.
 */

export type CheckStatus = "ok" | "warn" | "missing" | "error";

export interface CheckResult {
  /** Short identifier — also used by tests + CI to grep specific checks. */
  id: string;
  /** One-line human-readable label. */
  label: string;
  status: CheckStatus;
  /** One-line detail (path, count, version, etc.). */
  detail: string;
  /** Optional fix hint when status ≠ "ok". */
  hint?: string;
}

export interface CheckGroup {
  group: string;
  results: CheckResult[];
}

export type StepStatus = "skipped" | "ran" | "failed";

export interface StepResult {
  id: string;
  label: string;
  status: StepStatus;
  durationMs: number;
  /** Optional one-line summary. */
  detail?: string;
  /** Optional error message when status = "failed". */
  error?: string;
}

export interface SetupSummary {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: StepResult[];
  ok: boolean;
}
