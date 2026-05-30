import type { CausalNode, ConfidenceLevel } from "@/features/causal-engine";
import type { InterventionDecisionView } from "@/features/intervention-tracking";
import { formatDecimal, formatDelta, formatRange } from "@/lib/formatters";
import { HONESTY_DISCLAIMER, ciSpansZero, interventionLabel } from "@/lib/intervention-language";

import ConfidenceChip from "./ConfidenceChip";
import InterventionActionBar from "./InterventionActionBar";

export interface InterventionCardData {
  /**
   * Phase 11 — id of the persisted `InterventionSimulation` row.
   * `null` for transient previews produced by the what-if simulator; in
   * that case the card hides the decision action bar.
   */
  interventionSimulationId: string | null;
  interventionName: string;
  treatment: CausalNode;
  baselineValue: number;
  proposedValue: number;
  appliedDelta: number;
  estimatedEffect: number;
  baselineGrade: number;
  projectedGrade: number;
  projectedLow: number;
  projectedHigh: number;
  rankScore: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

interface InterventionCardProps {
  intervention: InterventionCardData;
  rank?: number;
  /** Phase 11 — pre-fetched decision for this simulation, or null when proposed. */
  decision?: InterventionDecisionView | null;
}

export default function InterventionCard({ intervention, rank, decision }: InterventionCardProps) {
  const projectedDelta = intervention.projectedGrade - intervention.baselineGrade;
  const lowDelta = intervention.projectedLow - intervention.baselineGrade;
  const highDelta = intervention.projectedHigh - intervention.baselineGrade;
  const spansZero = ciSpansZero(intervention);
  const headroomClamped = Math.abs(intervention.appliedDelta) < 1e-6;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {typeof rank === "number" ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Recommendation #{rank}
            </p>
          ) : null}
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {interventionLabel(intervention.interventionName)}
          </h3>
        </div>
        <ConfidenceChip level={intervention.confidence} />
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Projected change
          </p>
          <p className="mt-0.5 text-lg font-semibold text-slate-900">
            {formatDelta(projectedDelta)}
          </p>
          <p className="text-[11px] text-slate-500">grade points</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Improvement range
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {formatRange(lowDelta, highDelta)}
          </p>
          <p className="text-[11px] text-slate-500">bootstrap CI bounds</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-600">
        <div>
          <p className="uppercase tracking-wide text-slate-400">Current</p>
          <p className="mt-0.5 font-medium text-slate-800">{formatDecimal(intervention.baselineValue, 2)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-slate-400">Proposed</p>
          <p className="mt-0.5 font-medium text-slate-800">{formatDecimal(intervention.proposedValue, 2)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-slate-400">β used</p>
          <p className="mt-0.5 font-medium text-slate-800">{formatDecimal(intervention.estimatedEffect, 2)}</p>
        </div>
      </div>

      {(spansZero || headroomClamped) && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-1">
          {spansZero ? <p>The model cannot rule out no effect.</p> : null}
          {headroomClamped ? (
            <p>Student is already at the cohort ceiling for this feature — no room to apply this change.</p>
          ) : null}
        </div>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-slate-700">{intervention.explanation}</p>

      <p className="mt-3 text-[11px] italic text-slate-400">{HONESTY_DISCLAIMER}</p>

      {intervention.interventionSimulationId !== null && (
        <InterventionActionBar
          interventionSimulationId={intervention.interventionSimulationId}
          initialDecision={decision ?? null}
        />
      )}
    </article>
  );
}
