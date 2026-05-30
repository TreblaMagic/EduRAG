/**
 * Phase 9 — pure formatters for the setup / doctor / status terminal UX.
 *
 * No I/O — the CLIs print the strings these functions return. Pure means
 * we can snapshot-test the output shape and the test suite never
 * accidentally writes to stdout.
 */

import type { CheckGroup, CheckResult, SetupSummary, StepResult } from "./types";

const STATUS_GLYPH: Record<CheckResult["status"], string> = {
  ok: "[ ok ]",
  warn: "[warn]",
  missing: "[miss]",
  error: "[ err]",
};

const STEP_GLYPH: Record<StepResult["status"], string> = {
  skipped: "[skip]",
  ran: "[ ok ]",
  failed: "[fail]",
};

/** Render a list of {@link CheckGroup} blocks as a flat terminal string. */
export function renderCheckGroups(groups: ReadonlyArray<CheckGroup>): string {
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`▌ ${g.group}`);
    for (const r of g.results) {
      lines.push(`  ${STATUS_GLYPH[r.status]} ${r.label} — ${r.detail}`);
      if (r.hint && r.status !== "ok") lines.push(`         ↳ ${r.hint}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Render a single {@link CheckResult} line. */
export function renderCheckLine(r: CheckResult): string {
  const base = `${STATUS_GLYPH[r.status]} ${r.label} — ${r.detail}`;
  return r.hint && r.status !== "ok" ? `${base}\n         ↳ ${r.hint}` : base;
}

/** Render a single setup step line. */
export function renderStepLine(s: StepResult): string {
  const ms = `${s.durationMs}ms`.padStart(7, " ");
  const detail = s.detail ? ` — ${s.detail}` : "";
  const err = s.error ? `\n         ↳ ${s.error}` : "";
  return `${STEP_GLYPH[s.status]} ${ms}  ${s.label}${detail}${err}`;
}

/** Render a {@link SetupSummary} with header + per-step lines + closing line. */
export function renderSetupSummary(summary: SetupSummary): string {
  const lines: string[] = [];
  lines.push(`▌ EduRAG setup — ${summary.ok ? "completed" : "FAILED"}`);
  for (const step of summary.steps) lines.push(`  ${renderStepLine(step)}`);
  lines.push("");
  const totalSec = (summary.totalDurationMs / 1000).toFixed(2);
  lines.push(`  Total: ${totalSec}s (${summary.steps.length} steps)`);
  if (!summary.ok) {
    lines.push("  → Run `npm run doctor` to inspect the failure in detail.");
  } else {
    lines.push("  → Next: `npm run demo`  or  `npm run dev`  (dashboard on http://localhost:3000)");
  }
  return lines.join("\n");
}

/** True iff every check in every group is "ok" or "warn". */
export function isHealthy(groups: ReadonlyArray<CheckGroup>): boolean {
  for (const g of groups) {
    for (const r of g.results) {
      if (r.status === "missing" || r.status === "error") return false;
    }
  }
  return true;
}

/** Count statuses across all groups — handy for the doctor summary line. */
export function countByStatus(
  groups: ReadonlyArray<CheckGroup>,
): Record<CheckResult["status"], number> {
  const out: Record<CheckResult["status"], number> = {
    ok: 0,
    warn: 0,
    missing: 0,
    error: 0,
  };
  for (const g of groups) {
    for (const r of g.results) out[r.status]++;
  }
  return out;
}
