/**
 * Phase 11 — intervention-tracking types.
 *
 * The feedback loop layer that sits on top of Phase 4's per-student
 * counterfactual simulations. Pure type definitions only; persistence
 * lives in `src/server/intervention-tracking/`.
 *
 * **Honesty constraint (binding).** An accepted intervention does *not*
 * validate the underlying causal model. A positive follow-up observation
 * does *not* prove the model's projection is causally true. The status
 * + outcome fields are observational notes — the UI + the report
 * renderer must surface that caveat next to every persisted note.
 */

/**
 * Statuses persisted in the database.
 *
 * `proposed` is the implicit default state when no decision row exists
 * yet — it is included in the enum for UI rendering but never
 * persisted. Only the four explicit decisions ever hit the table.
 */
export const DECISION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "deferred",
  "completed",
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const PERSISTED_STATUSES: ReadonlyArray<Exclude<DecisionStatus, "proposed">> = [
  "accepted",
  "rejected",
  "deferred",
  "completed",
];

/**
 * Shape rendered alongside each intervention card. Carries enough
 * provenance for the UI to show "Accepted by advisor on …", "Awaiting
 * follow-up", or "Observational improvement noted".
 */
export interface InterventionDecisionView {
  id: string | null;
  interventionSimulationId: string;
  status: DecisionStatus;
  advisorNote: string | null;
  followUpOutcome: string | null;
  followUpObserved: boolean;
  followUpRecordedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * One row in the per-student intervention timeline. Combines the
 * recommendation, the decision, and the follow-up into a single
 * chronologically-ordered list the UI can render flat.
 */
export type TimelineEventKind =
  | "recommendation"
  | "decision"
  | "note"
  | "follow-up";

export interface TimelineEvent {
  kind: TimelineEventKind;
  at: string;
  /** Short heading line for the timeline entry. */
  label: string;
  /** Optional secondary line — note text, observation, etc. */
  detail: string | null;
  /** The intervention this event relates to. */
  interventionName: string;
  /** Persisted status at the time of the event (when applicable). */
  status: DecisionStatus | null;
}

/** Cohort-level analytics rendered on `/interventions`. */
export interface InterventionAnalytics {
  totalRecommendations: number;
  decisionCounts: Record<Exclude<DecisionStatus, "proposed">, number>;
  proposedCount: number;
  mostAccepted: { interventionName: string; count: number } | null;
  mostDeferred: { interventionName: string; count: number } | null;
  followUpsRecorded: number;
  followUpsPending: number;
  observationalInsights: string[];
}
