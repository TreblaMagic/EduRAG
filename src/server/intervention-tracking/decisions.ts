/**
 * Phase 11 — intervention-decision orchestration.
 *
 * Single source of mutation logic for the feedback-loop layer. The
 * server action + the report builder + the dashboard queries all go
 * through here so the persisted shape stays consistent.
 *
 * Honesty-language enforcement: `recordDecision` /
 * `recordFollowUp` both call {@link containsBannedLanguage}. Any banned
 * phrase ("guaranteed", "proven cause", …) is rejected with a
 * structured error before the row is written. The UI surfaces the
 * specific phrase to the user so they can rephrase.
 */

import type { PrismaClient } from "@prisma/client";

import {
  containsBannedLanguage,
  PERSISTED_STATUSES,
  type DecisionStatus,
} from "@/features/intervention-tracking";

import { prisma as defaultPrisma } from "@/lib/db";

const NOTE_MAX_LEN = 500;

export type PersistedDecisionStatus = Exclude<DecisionStatus, "proposed">;

function isPersistedStatus(value: string): value is PersistedDecisionStatus {
  return (PERSISTED_STATUSES as ReadonlyArray<string>).includes(value);
}

export interface RecordDecisionInput {
  interventionSimulationId: string;
  status: PersistedDecisionStatus;
  advisorNote?: string | null;
  prisma?: PrismaClient;
}

export interface RecordFollowUpInput {
  interventionSimulationId: string;
  followUpOutcome: string | null;
  followUpObserved?: boolean;
  prisma?: PrismaClient;
}

export interface DecisionResult {
  ok: boolean;
  id: string | null;
  status: DecisionStatus;
  error: string | null;
}

/**
 * Upsert a decision row for the given simulation. The first call creates
 * the row at the given status; subsequent calls flip the status / update
 * the note without dropping history (history lives in the timeline
 * builder, not on the decision row).
 */
export async function recordDecision(
  input: RecordDecisionInput,
): Promise<DecisionResult> {
  const prisma = input.prisma ?? defaultPrisma;

  if (!isPersistedStatus(input.status)) {
    return errorResult(`Unsupported decision status: ${input.status}`);
  }

  const noteValidation = validateAdvisorNote(input.advisorNote ?? null);
  if (noteValidation.error) return errorResult(noteValidation.error);

  const simulation = await prisma.interventionSimulation.findUnique({
    where: { id: input.interventionSimulationId },
  });
  if (!simulation) {
    return errorResult(
      `interventionSimulationId ${input.interventionSimulationId} not found`,
    );
  }

  const advisorNote = noteValidation.value ?? null;

  const row = await prisma.interventionDecision.upsert({
    where: { interventionSimulationId: input.interventionSimulationId },
    create: {
      interventionSimulationId: input.interventionSimulationId,
      studentId: simulation.studentId,
      courseId: simulation.courseId,
      status: input.status,
      advisorNote,
    },
    update: {
      status: input.status,
      advisorNote: advisorNote !== null ? advisorNote : undefined,
    },
  });

  return {
    ok: true,
    id: row.id,
    status: row.status as DecisionStatus,
    error: null,
  };
}

/**
 * Record an observational follow-up. Pre-condition: the decision must
 * already be `accepted` or `completed` — recording a follow-up against
 * a `rejected`/`deferred` decision doesn't make sense for the demo and
 * is rejected to make the workflow obvious.
 */
export async function recordFollowUp(
  input: RecordFollowUpInput,
): Promise<DecisionResult> {
  const prisma = input.prisma ?? defaultPrisma;

  const outcomeValidation = validateFollowUpOutcome(input.followUpOutcome);
  if (outcomeValidation.error) return errorResult(outcomeValidation.error);

  const decision = await prisma.interventionDecision.findUnique({
    where: { interventionSimulationId: input.interventionSimulationId },
  });
  if (!decision) {
    return errorResult(
      "No decision exists yet — accept or complete the recommendation before recording a follow-up.",
    );
  }
  if (decision.status !== "accepted" && decision.status !== "completed") {
    return errorResult(
      `Follow-ups can only be recorded for "accepted" or "completed" decisions; current status is "${decision.status}".`,
    );
  }

  const observed = input.followUpObserved ?? true;
  const followUpOutcome = outcomeValidation.value ?? null;
  const row = await prisma.interventionDecision.update({
    where: { id: decision.id },
    data: {
      followUpOutcome,
      followUpObserved: observed,
      followUpRecordedAt: observed ? new Date() : null,
    },
  });
  return {
    ok: true,
    id: row.id,
    status: row.status as DecisionStatus,
    error: null,
  };
}

/** Reset a decision back to the implicit `proposed` state by deleting the row. */
export async function clearDecision(
  interventionSimulationId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<DecisionResult> {
  await prisma.interventionDecision
    .delete({ where: { interventionSimulationId } })
    .catch(() => {
      // Idempotent — already absent.
    });
  return { ok: true, id: null, status: "proposed", error: null };
}

// ---- helpers --------------------------------------------------------------

function errorResult(error: string): DecisionResult {
  return { ok: false, id: null, status: "proposed", error };
}

interface ValidationOk {
  value: string | null;
  error: null;
}
interface ValidationErr {
  value: null;
  error: string;
}
type ValidationResult = ValidationOk | ValidationErr;

function validateAdvisorNote(note: string | null): ValidationResult {
  if (note === null) return { value: null, error: null };
  const trimmed = note.trim();
  if (trimmed.length === 0) return { value: null, error: null };
  if (trimmed.length > NOTE_MAX_LEN) {
    return { value: null, error: `advisorNote exceeds ${NOTE_MAX_LEN} characters` };
  }
  const banned = containsBannedLanguage(trimmed);
  if (banned) {
    return {
      value: null,
      error: `advisorNote contains banned phrase "${banned}" — please rephrase. Notes are observational and must not assert causal proof.`,
    };
  }
  return { value: trimmed, error: null };
}

function validateFollowUpOutcome(outcome: string | null): ValidationResult {
  if (outcome === null) return { value: null, error: null };
  const trimmed = outcome.trim();
  if (trimmed.length === 0) return { value: null, error: null };
  if (trimmed.length > NOTE_MAX_LEN) {
    return {
      value: null,
      error: `followUpOutcome exceeds ${NOTE_MAX_LEN} characters`,
    };
  }
  const banned = containsBannedLanguage(trimmed);
  if (banned) {
    return {
      value: null,
      error: `followUpOutcome contains banned phrase "${banned}" — please rephrase. Follow-ups are observational and must not assert causal proof.`,
    };
  }
  return { value: trimmed, error: null };
}
