/**
 * Phase 11 — vertical timeline renderer for per-student decision history.
 *
 * Server-rendered. Reads `TimelineEvent[]` produced by
 * `buildTimelineEvents` and groups events by kind for visual contrast.
 * Used on `/students/[id]` below the ranked intervention cards.
 */

import type { TimelineEvent } from "@/features/intervention-tracking";
import { interventionLabel } from "@/lib/intervention-language";

import DecisionStatusChip from "./DecisionStatusChip";

interface Props {
  events: TimelineEvent[];
}

const KIND_ACCENT: Record<TimelineEvent["kind"], string> = {
  recommendation: "border-slate-300 bg-slate-50",
  decision: "border-indigo-300 bg-indigo-50",
  note: "border-amber-300 bg-amber-50",
  "follow-up": "border-emerald-300 bg-emerald-50",
};

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  recommendation: "Recommendation",
  decision: "Decision",
  note: "Note",
  "follow-up": "Follow-up",
};

export default function InterventionTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
        No decisions recorded yet. Accept, reject, or defer a recommendation above
        and the activity will appear here in chronological order.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.at}-${i}`} className="relative">
          <span
            className={`absolute -left-[19px] top-2 inline-flex h-3 w-3 rounded-full border-2 bg-white ${KIND_ACCENT[e.kind].split(" ")[0]}`}
            aria-hidden
          />
          <div
            className={`rounded-md border px-3 py-2 ${KIND_ACCENT[e.kind]}`}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {KIND_LABEL[e.kind]}
                </span>
                <span className="font-medium">
                  {interventionLabel(e.interventionName)}
                </span>
                {e.status && <DecisionStatusChip status={e.status} />}
              </div>
              <time className="text-[10px] text-slate-500">
                {new Date(e.at).toLocaleString()}
              </time>
            </header>
            <p className="mt-1 text-sm text-slate-800">{e.label}</p>
            {e.detail && (
              <p className="mt-1 text-xs italic text-slate-600">{e.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
