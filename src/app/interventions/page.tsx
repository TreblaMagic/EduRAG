/**
 * Phase 11 — cohort intervention-tracking analytics + activity feed.
 *
 * Server component. Pulls the analytics summary + latest decisions
 * via the intervention-tracking query module. The page is intentionally
 * observational — it tracks what advisors did, never claims a
 * decision validates the causal model.
 */

import Link from "next/link";

import {
  STATUS_HINT,
  type DecisionStatus,
} from "@/features/intervention-tracking";
import { interventionLabel } from "@/lib/intervention-language";
import {
  getCohortAnalytics,
  getRecentDecisions,
} from "@/server/intervention-tracking";

import DecisionStatusChip from "@/components/DecisionStatusChip";
import EmptyState from "@/components/EmptyState";
import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function InterventionsPage() {
  const [analytics, recent] = await Promise.all([
    getCohortAnalytics(),
    getRecentDecisions(undefined, 12),
  ]);

  const noDecisions = recent.length === 0;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <PageHeader
        title="Interventions"
        subtitle="Cohort-wide view of recorded advisor decisions, observational follow-ups, and aggregate patterns. EduRAG supports iterative intervention tracking — not one-time prediction."
      />

      <HonestyNote tone="info" title="Observational, not causal">
        Decisions on this page describe <em>what advisors did</em> and{" "}
        <em>what advisors observed</em>. Accepting a recommendation does not
        validate the causal model; a positive follow-up does not prove the
        projected lift materialised. Notes are advisor-supplied context, not
        scientific evidence.
      </HonestyNote>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <MetricCard
          label="Recommendations"
          value={analytics.totalRecommendations.toLocaleString()}
          hint="From the Phase 4 simulator"
        />
        <MetricCard
          label="Proposed"
          value={analytics.proposedCount.toLocaleString()}
          hint="No advisor decision yet"
        />
        <MetricCard
          label="Accepted"
          value={(
            analytics.decisionCounts.accepted + analytics.decisionCounts.completed
          ).toLocaleString()}
          hint="incl. completed"
          tone="positive"
        />
        <MetricCard
          label="Rejected / Deferred"
          value={(
            analytics.decisionCounts.rejected + analytics.decisionCounts.deferred
          ).toLocaleString()}
          hint="advisor chose not to apply now"
        />
        <MetricCard
          label="Follow-ups recorded"
          value={analytics.followUpsRecorded.toLocaleString()}
          hint={`${analytics.followUpsPending} pending`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Decision breakdown</h2>
          <p className="text-xs text-slate-500 mt-1">
            Counts of every persisted decision row, grouped by status.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {(["accepted", "completed", "deferred", "rejected"] as const).map((s) => (
              <li
                key={s}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <DecisionStatusChip status={s} />
                  <span className="text-xs text-slate-500">{STATUS_HINT[s]}</span>
                </span>
                <span className="font-semibold text-slate-900">
                  {analytics.decisionCounts[s].toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Most active levers</h2>
          <p className="text-xs text-slate-500 mt-1">
            Which recommendations did advisors most often act on?
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <PatternRow
              label="Most accepted"
              value={
                analytics.mostAccepted
                  ? `${interventionLabel(analytics.mostAccepted.interventionName)} (${analytics.mostAccepted.count})`
                  : "—"
              }
              tone="emerald"
            />
            <PatternRow
              label="Most deferred"
              value={
                analytics.mostDeferred
                  ? `${interventionLabel(analytics.mostDeferred.interventionName)} (${analytics.mostDeferred.count})`
                  : "—"
              }
              tone="amber"
            />
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Observational insights</h2>
        <p className="text-xs text-slate-500 mt-1">
          Descriptive summary of advisor behaviour — never a causal validation
          claim.
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-1 text-sm text-slate-700">
          {analytics.observationalInsights.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
            <p className="text-xs text-slate-500 mt-1">
              Latest 12 advisor decisions, newest first.
            </p>
          </div>
        </div>

        {noDecisions ? (
          <EmptyState
            title="No advisor decisions yet"
            description={
              <>
                Open any student profile (e.g.{" "}
                <Link href="/students/STU-0042" className="text-indigo-700 hover:underline">
                  STU-0042
                </Link>
                ) and react to a recommendation — accept, reject, defer, or add a
                note. Each action will appear here in chronological order.
              </>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
            {recent.map((r) => (
              <li key={r.decisionId} className="px-4 py-3 text-sm">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <DecisionStatusChip status={r.status as DecisionStatus} />
                    <Link
                      href={`/students/${r.studentExternalId}`}
                      className="font-mono text-xs text-indigo-700 hover:underline"
                    >
                      {r.studentExternalId}
                    </Link>
                    <span className="text-xs text-slate-500">{r.courseCode}</span>
                    <span className="font-medium text-slate-900">
                      {interventionLabel(r.interventionName)}
                    </span>
                  </div>
                  <time className="text-[11px] text-slate-500">
                    {new Date(r.updatedAt).toLocaleString()}
                  </time>
                </header>
                {r.advisorNote && (
                  <p className="mt-1 text-xs italic text-slate-600">
                    “{r.advisorNote}”
                  </p>
                )}
                {r.followUpObserved && (
                  <p className="mt-1 text-[11px] text-emerald-700">
                    Observational follow-up recorded.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        Every decision row is persisted in the new <code className="font-mono">InterventionDecision</code> table and
        flows into the downloadable causal report when the{" "}
        <code className="font-mono">--tracking</code> flag is set.
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "warning";
}) {
  const toneClasses =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg border px-4 py-3 shadow-sm ${toneClasses}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function PatternRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber";
}) {
  const dotClass = tone === "emerald" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        {label}
      </dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

