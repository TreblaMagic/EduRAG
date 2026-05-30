/**
 * Phase 11 — pure timeline builder.
 *
 * Takes the raw inputs (a generated-at timestamp for the simulation,
 * the persisted decision row if any, the persisted follow-up fields)
 * and returns a flat, chronologically-ordered list of
 * {@link TimelineEvent} entries the UI can render directly.
 *
 * Pure — no I/O. Tests cover the ordering and the per-event shaping.
 */

import { STATUS_VERB } from "./status";
import type { DecisionStatus, TimelineEvent } from "./types";

export interface TimelineInput {
  interventionName: string;
  simulationGeneratedAt: string;
  decision: {
    status: DecisionStatus;
    advisorNote: string | null;
    followUpOutcome: string | null;
    followUpObserved: boolean;
    followUpRecordedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}

export function buildTimelineEvents(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    kind: "recommendation",
    at: input.simulationGeneratedAt,
    label: `Recommendation generated: ${input.interventionName}`,
    detail: "Causal engine produced this counterfactual.",
    interventionName: input.interventionName,
    status: "proposed",
  });

  const decision = input.decision;
  if (decision) {
    const status = decision.status;
    events.push({
      kind: "decision",
      at: decision.createdAt ?? decision.updatedAt ?? input.simulationGeneratedAt,
      label: `Advisor ${STATUS_VERB[status]} the recommendation`,
      detail: null,
      interventionName: input.interventionName,
      status,
    });

    if (decision.advisorNote && decision.advisorNote.trim().length > 0) {
      events.push({
        kind: "note",
        at: decision.updatedAt ?? decision.createdAt ?? input.simulationGeneratedAt,
        label: "Advisor note added",
        detail: decision.advisorNote.trim(),
        interventionName: input.interventionName,
        status,
      });
    }

    if (decision.followUpObserved && decision.followUpRecordedAt) {
      events.push({
        kind: "follow-up",
        at: decision.followUpRecordedAt,
        label: "Observational follow-up recorded",
        detail:
          decision.followUpOutcome?.trim() ||
          "No outcome text provided — follow-up was noted but not described.",
        interventionName: input.interventionName,
        status,
      });
    }
  }

  return events.sort((a, b) => {
    const da = Date.parse(a.at);
    const db = Date.parse(b.at);
    if (Number.isNaN(da) || Number.isNaN(db)) return 0;
    return da - db;
  });
}

/** Merge per-intervention timelines into a single student-wide feed. */
export function mergeTimelines(perIntervention: TimelineEvent[][]): TimelineEvent[] {
  return perIntervention
    .flat()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
