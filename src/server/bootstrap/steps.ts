/**
 * Phase 9 — setup-step orchestrator.
 *
 * Pure scheduling logic — each step is a `{ id, label, shouldRun, run }`
 * tuple. The runner asks `shouldRun()` first (an idempotency check) and
 * skips the step when false. The actual `run()` callback usually shells
 * out (npm scripts, prisma, the synthetic-data generator); the runner
 * just times it and captures the structured result.
 *
 * Splitting orchestration from the step definitions means the setup CLI
 * can be tested by passing in mock steps that don't shell out at all.
 */

import type { StepResult, SetupSummary } from "./types";

export interface SetupStep {
  id: string;
  label: string;
  shouldRun: () => Promise<boolean> | boolean;
  run: () => Promise<void>;
  /** Optional detail printed when the step is skipped. */
  skipDetail?: string;
  /** Optional detail printed when the step completes. */
  doneDetail?: string;
}

export interface RunStepsOptions {
  /** Called after each step with the step result. The CLI uses this to stream. */
  onStep?: (result: StepResult) => void;
  /** When true (default), abort the remaining steps on the first failure. */
  stopOnError?: boolean;
}

export async function runSteps(
  steps: ReadonlyArray<SetupStep>,
  options: RunStepsOptions = {},
): Promise<SetupSummary> {
  const startedAtMs = Date.now();
  const results: StepResult[] = [];
  const stopOnError = options.stopOnError ?? true;

  for (const step of steps) {
    const stepStart = Date.now();
    let result: StepResult;
    try {
      const should = await step.shouldRun();
      if (!should) {
        result = {
          id: step.id,
          label: step.label,
          status: "skipped",
          durationMs: Date.now() - stepStart,
          ...(step.skipDetail ? { detail: step.skipDetail } : {}),
        };
      } else {
        await step.run();
        result = {
          id: step.id,
          label: step.label,
          status: "ran",
          durationMs: Date.now() - stepStart,
          ...(step.doneDetail ? { detail: step.doneDetail } : {}),
        };
      }
    } catch (e) {
      result = {
        id: step.id,
        label: step.label,
        status: "failed",
        durationMs: Date.now() - stepStart,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    results.push(result);
    options.onStep?.(result);
    if (result.status === "failed" && stopOnError) break;
  }

  const finishedAtMs = Date.now();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    totalDurationMs: finishedAtMs - startedAtMs,
    steps: results,
    ok: results.every((r) => r.status !== "failed"),
  };
}
