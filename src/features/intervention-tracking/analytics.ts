/**
 * Phase 11 — pure analytics helpers for the cohort intervention page.
 *
 * Counts decisions, finds the most-accepted / most-deferred
 * recommendation by name, and emits a small list of observational
 * insights. The insights are *descriptive* — they never claim that
 * accepting an intervention proved the causal model, or that a
 * positive follow-up validated the projected lift.
 */

import { PERSISTED_STATUSES } from "./types";
import type { DecisionStatus, InterventionAnalytics } from "./types";

export interface DecisionRow {
  interventionName: string;
  status: Exclude<DecisionStatus, "proposed">;
  followUpObserved: boolean;
  followUpOutcome: string | null;
  treatment: string;
}

export interface AnalyticsInput {
  totalRecommendations: number;
  decisions: ReadonlyArray<DecisionRow>;
}

export function computeAnalytics(input: AnalyticsInput): InterventionAnalytics {
  const counts: Record<Exclude<DecisionStatus, "proposed">, number> = {
    accepted: 0,
    rejected: 0,
    deferred: 0,
    completed: 0,
  };

  const acceptedByName: Map<string, number> = new Map();
  const deferredByName: Map<string, number> = new Map();
  const treatmentAccepted: Map<string, number> = new Map();

  for (const d of input.decisions) {
    counts[d.status]++;
    if (d.status === "accepted" || d.status === "completed") {
      acceptedByName.set(
        d.interventionName,
        (acceptedByName.get(d.interventionName) ?? 0) + 1,
      );
      treatmentAccepted.set(
        d.treatment,
        (treatmentAccepted.get(d.treatment) ?? 0) + 1,
      );
    }
    if (d.status === "deferred") {
      deferredByName.set(
        d.interventionName,
        (deferredByName.get(d.interventionName) ?? 0) + 1,
      );
    }
  }

  const followUpsRecorded = input.decisions.filter((d) => d.followUpObserved).length;
  const followUpsPending =
    counts.accepted + counts.completed - followUpsRecorded;

  return {
    totalRecommendations: input.totalRecommendations,
    proposedCount: Math.max(0, input.totalRecommendations - input.decisions.length),
    decisionCounts: counts,
    mostAccepted: topEntry(acceptedByName),
    mostDeferred: topEntry(deferredByName),
    followUpsRecorded,
    followUpsPending: Math.max(0, followUpsPending),
    observationalInsights: buildInsights({
      counts,
      acceptedByName,
      treatmentAccepted,
      deferredByName,
      followUpsRecorded,
    }),
  };
}

function topEntry(
  map: Map<string, number>,
): { interventionName: string; count: number } | null {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of map) {
    if (!best || count > best.count) best = { name, count };
  }
  return best ? { interventionName: best.name, count: best.count } : null;
}

interface InsightInput {
  counts: Record<Exclude<DecisionStatus, "proposed">, number>;
  acceptedByName: Map<string, number>;
  treatmentAccepted: Map<string, number>;
  deferredByName: Map<string, number>;
  followUpsRecorded: number;
}

/**
 * Insights are deliberately observational. They describe *what advisors
 * did* and *what advisors observed*, never claiming causal validation.
 * The strings are also free of the {@link BANNED_PHRASES} from
 * `status.ts` — asserted by the test suite.
 */
function buildInsights(input: InsightInput): string[] {
  const insights: string[] = [];
  const accepted = input.counts.accepted + input.counts.completed;
  const rejected = input.counts.rejected;
  const deferred = input.counts.deferred;
  const total = accepted + rejected + deferred;

  if (total === 0) {
    insights.push(
      "No advisor decisions recorded yet. Open any student profile and react to a recommendation to populate this feed.",
    );
    return insights;
  }

  insights.push(
    `${accepted} of ${total} recorded decisions were acceptances or completions (observational summary only).`,
  );

  if (input.treatmentAccepted.size > 0) {
    const top = topEntry(input.treatmentAccepted);
    if (top) {
      insights.push(
        `Accepted interventions most often targeted ${top.interventionName} (${top.count} times). This describes advisor behaviour — not a causal validation of the underlying β.`,
      );
    }
  }

  if (input.counts.deferred > 0) {
    const deferTop = topEntry(input.deferredByName);
    if (deferTop) {
      insights.push(
        `Deferrals were most often applied to ${deferTop.interventionName} (${deferTop.count} times). Common reasons live in the advisor-note field.`,
      );
    }
  }

  if (input.followUpsRecorded > 0) {
    insights.push(
      `${input.followUpsRecorded} follow-up observation${input.followUpsRecorded === 1 ? "" : "s"} recorded. These are advisor-supplied observations — not proof that the projected lift materialised.`,
    );
  } else if (accepted > 0) {
    insights.push(
      `${accepted} acceptance${accepted === 1 ? "" : "s"} are still awaiting a follow-up observation.`,
    );
  }

  insights.push(
    "Prediction tells you who needs attention; intervention tracking captures what advisors actually did. The two layers complement each other — they do not prove each other.",
  );

  return insights;
}

/** Type-guard list used by callers to filter persisted rows down from the broader union. */
export const PERSISTED_STATUS_LIST = PERSISTED_STATUSES;
