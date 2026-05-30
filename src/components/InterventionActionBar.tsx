"use client";

/**
 * Phase 11 — interactive action bar attached to each `<InterventionCard>`.
 *
 * Exposes the four feedback actions (accept / reject / defer / complete)
 * + an optional advisor-note field + an observational follow-up form
 * (only visible once the decision is accepted/completed). The action
 * bar talks to the Phase 11 server actions; mutations never live in
 * presentational components.
 *
 * Honesty UX: the follow-up form is *always* paired with a small
 * banner that reads "Observational follow-up — not proof of causality"
 * so the recorded text never reads like a model validation.
 */

import { useState, useTransition } from "react";

import type {
  DecisionStatus,
  InterventionDecisionView,
} from "@/features/intervention-tracking";
import { STATUS_HINT } from "@/features/intervention-tracking";
import {
  revertDecision,
  submitDecision,
  submitFollowUp,
  type ActionResult,
} from "@/server/actions/intervention-tracking";

import DecisionStatusChip from "./DecisionStatusChip";

interface Props {
  interventionSimulationId: string;
  initialDecision: InterventionDecisionView | null;
}

const PRIMARY_BUTTONS: ReadonlyArray<{
  status: Exclude<DecisionStatus, "proposed" | "completed">;
  label: string;
  tone: "emerald" | "rose" | "amber";
}> = [
  { status: "accepted", label: "Accept", tone: "emerald" },
  { status: "rejected", label: "Reject", tone: "rose" },
  { status: "deferred", label: "Defer", tone: "amber" },
];

const TONE_CLASSES: Record<"emerald" | "rose" | "amber", string> = {
  emerald:
    "border-emerald-300 text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100",
  rose: "border-rose-300 text-rose-700 hover:bg-rose-50 active:bg-rose-100",
  amber: "border-amber-300 text-amber-800 hover:bg-amber-50 active:bg-amber-100",
};

export default function InterventionActionBar({
  interventionSimulationId,
  initialDecision,
}: Props) {
  const [decision, setDecision] = useState<InterventionDecisionView | null>(
    initialDecision,
  );
  const [advisorNote, setAdvisorNote] = useState(initialDecision?.advisorNote ?? "");
  const [followUpText, setFollowUpText] = useState(
    initialDecision?.followUpOutcome ?? "",
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const status: DecisionStatus = decision?.status ?? "proposed";

  function applyResult(result: ActionResult, optimistic: Partial<InterventionDecisionView>): void {
    if (!result.ok) {
      setFeedback({ ok: false, text: result.error ?? "Action failed." });
      return;
    }
    setFeedback({ ok: true, text: `Decision updated → ${result.status}.` });
    setDecision({
      id: result.decisionId,
      interventionSimulationId,
      status: result.status,
      advisorNote: optimistic.advisorNote ?? decision?.advisorNote ?? null,
      followUpOutcome:
        optimistic.followUpOutcome ?? decision?.followUpOutcome ?? null,
      followUpObserved:
        optimistic.followUpObserved ?? decision?.followUpObserved ?? false,
      followUpRecordedAt:
        optimistic.followUpRecordedAt ?? decision?.followUpRecordedAt ?? null,
      createdAt: decision?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function submitStatus(target: Exclude<DecisionStatus, "proposed">): void {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("interventionSimulationId", interventionSimulationId);
      fd.set("status", target);
      if (advisorNote.trim().length > 0) fd.set("advisorNote", advisorNote.trim());
      const result = await submitDecision(fd);
      applyResult(result, { advisorNote: advisorNote.trim() || null });
    });
  }

  function submitFollowUpForm(): void {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("interventionSimulationId", interventionSimulationId);
      fd.set("followUpOutcome", followUpText.trim());
      const result = await submitFollowUp(fd);
      applyResult(result, {
        followUpOutcome: followUpText.trim() || null,
        followUpObserved: true,
        followUpRecordedAt: new Date().toISOString(),
      });
    });
  }

  function revert(): void {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("interventionSimulationId", interventionSimulationId);
      const result = await revertDecision(fd);
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Revert failed." });
        return;
      }
      setDecision(null);
      setAdvisorNote("");
      setFollowUpText("");
      setFeedback({ ok: true, text: "Decision reverted to proposed." });
    });
  }

  const followUpAllowed = status === "accepted" || status === "completed";

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DecisionStatusChip status={status} />
          <span className="text-[11px] text-slate-500">{STATUS_HINT[status]}</span>
        </div>
        {decision?.updatedAt && (
          <span className="text-[10px] text-slate-400">
            Updated {new Date(decision.updatedAt).toLocaleString()}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Advisor note (optional)
          <input
            type="text"
            value={advisorNote}
            maxLength={500}
            onChange={(e) => setAdvisorNote(e.target.value)}
            placeholder='e.g. "Student agreed to diversify resources next term"'
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-800"
          />
        </label>
        <div className="flex items-end gap-1 flex-wrap">
          {PRIMARY_BUTTONS.map((b) => (
            <button
              key={b.status}
              type="button"
              disabled={pending}
              onClick={() => submitStatus(b.status)}
              className={`rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${TONE_CLASSES[b.tone]}`}
            >
              {b.label}
            </button>
          ))}
          {status === "accepted" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStatus("completed")}
              className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              Mark complete
            </button>
          )}
          {status !== "proposed" && (
            <button
              type="button"
              disabled={pending}
              onClick={revert}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Revert
            </button>
          )}
        </div>
      </div>

      {followUpAllowed && (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Observational follow-up
          </p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            Observational follow-up — not proof of causality. Recording this does
            not confirm or refute the model&apos;s projection.
          </p>
          <textarea
            value={followUpText}
            maxLength={500}
            rows={2}
            onChange={(e) => setFollowUpText(e.target.value)}
            placeholder='e.g. "Quiz average improved slightly over three weeks"'
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              {decision?.followUpObserved
                ? `Last recorded ${decision.followUpRecordedAt ? new Date(decision.followUpRecordedAt).toLocaleString() : "—"}`
                : "No follow-up recorded yet."}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={submitFollowUpForm}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Record follow-up
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p
          className={`text-[11px] ${
            feedback.ok ? "text-emerald-700" : "text-rose-700"
          }`}
          role="status"
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
