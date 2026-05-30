"use server";

/**
 * Phase 11 — server actions for the intervention feedback loop.
 *
 *   `submitDecision`   — accept / reject / defer / complete + optional note
 *   `submitFollowUp`   — append an observational follow-up text
 *   `revertDecision`   — reset the decision back to the implicit "proposed" state
 *
 * Each action wraps the orchestrator helper, validates form input,
 * persists the change, and revalidates the routes that show the
 * decision (student profile, /interventions, /). Errors come back as
 * structured payloads — never thrown — so the client component can
 * surface them inline.
 */

import { revalidatePath } from "next/cache";

import {
  PERSISTED_STATUSES,
  type DecisionStatus,
} from "@/features/intervention-tracking";
import {
  clearDecision,
  recordDecision,
  recordFollowUp,
  type DecisionResult,
  type PersistedDecisionStatus,
} from "@/server/intervention-tracking";

const PERSISTED_LIST = PERSISTED_STATUSES as ReadonlyArray<string>;

function isPersistedStatus(value: unknown): value is PersistedDecisionStatus {
  return typeof value === "string" && PERSISTED_LIST.includes(value);
}

export interface ActionResult {
  ok: boolean;
  status: DecisionStatus;
  decisionId: string | null;
  error: string | null;
}

function toActionResult(r: DecisionResult): ActionResult {
  return {
    ok: r.ok,
    status: r.status,
    decisionId: r.id,
    error: r.error,
  };
}

export async function submitDecision(
  formData: FormData,
): Promise<ActionResult> {
  const simulationId = formData.get("interventionSimulationId");
  const status = formData.get("status");
  const advisorNote = formData.get("advisorNote");

  if (typeof simulationId !== "string" || simulationId.length === 0) {
    return errorResult("Missing interventionSimulationId");
  }
  if (!isPersistedStatus(status)) {
    return errorResult(
      `Unsupported status — expected one of ${PERSISTED_LIST.join(", ")}.`,
    );
  }

  const result = await recordDecision({
    interventionSimulationId: simulationId,
    status,
    advisorNote: typeof advisorNote === "string" ? advisorNote : null,
  });
  if (result.ok) revalidateRoutes();
  return toActionResult(result);
}

export async function submitFollowUp(
  formData: FormData,
): Promise<ActionResult> {
  const simulationId = formData.get("interventionSimulationId");
  const outcome = formData.get("followUpOutcome");
  const observedRaw = formData.get("followUpObserved");

  if (typeof simulationId !== "string" || simulationId.length === 0) {
    return errorResult("Missing interventionSimulationId");
  }

  const result = await recordFollowUp({
    interventionSimulationId: simulationId,
    followUpOutcome: typeof outcome === "string" ? outcome : null,
    followUpObserved: observedRaw === null ? true : observedRaw === "true" || observedRaw === "on",
  });
  if (result.ok) revalidateRoutes();
  return toActionResult(result);
}

export async function revertDecision(
  formData: FormData,
): Promise<ActionResult> {
  const simulationId = formData.get("interventionSimulationId");
  if (typeof simulationId !== "string" || simulationId.length === 0) {
    return errorResult("Missing interventionSimulationId");
  }
  const result = await clearDecision(simulationId);
  if (result.ok) revalidateRoutes();
  return toActionResult(result);
}

// ---- helpers --------------------------------------------------------------

function errorResult(error: string): ActionResult {
  return { ok: false, status: "proposed", decisionId: null, error };
}

function revalidateRoutes(): void {
  for (const path of ["/", "/students", "/interventions", "/comparison"]) {
    try {
      revalidatePath(path);
    } catch {
      // revalidatePath throws when called outside of a request scope; ignore.
    }
  }
}
