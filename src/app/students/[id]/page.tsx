import { notFound } from "next/navigation";
import Link from "next/link";

import { getStudentDetail } from "@/server/queries/students";
import {
  formatDecimal,
  formatDelta,
  formatGrade,
  formatNumber,
} from "@/lib/formatters";
import { featureLabel } from "@/lib/intervention-language";
import { riskMetaFor } from "@/lib/confidence-label";

import EmptyState from "@/components/EmptyState";
import HonestyNote from "@/components/HonestyNote";
import InterventionCard from "@/components/InterventionCard";
import InterventionTimeline from "@/components/InterventionTimeline";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import PredictionVsInterventionCard from "@/components/PredictionVsInterventionCard";
import TrendChart, { type TrendSeries } from "@/components/TrendChart";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getStudentDetail(id);
  if (!data) notFound();

  const risk = data.finalGrade !== null ? riskMetaFor(data.finalGrade) : null;

  const engagementSeries: TrendSeries = {
    label: "Engagement",
    color: "#4f46e5",
    points: data.timeline.map((t) => ({ x: t.week, y: t.engagement })),
  };
  const rdiSeries: TrendSeries = {
    label: "RDI",
    color: "#0ea5e9",
    points: data.timeline.map((t) => ({ x: t.week, y: t.rdi })),
  };
  const quizSeries: TrendSeries = {
    label: "Quiz avg.",
    color: "#f59e0b",
    points: data.timeline.map((t) => ({
      x: t.week,
      y: t.quizAverage !== null ? t.quizAverage / 100 : null,
    })),
  };

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title={data.student.externalId}
        subtitle={
          data.course
            ? `${data.course.code} · ${data.course.title} · cohort ${data.student.cohort}`
            : `Cohort ${data.student.cohort}`
        }
        action={
          <Link
            href="/"
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            ← Overview
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Final grade"
          value={data.finalGrade !== null ? formatGrade(data.finalGrade) : "—"}
          hint={risk ? risk.label : undefined}
          emphasis={
            risk?.level === "at-risk"
              ? "warning"
              : risk?.level === "on-track"
                ? "positive"
                : "default"
          }
        />
        <MetricCard label="Prior GPA" value={formatDecimal(data.student.priorGpa, 2)} />
        <MetricCard
          label="Mean engagement"
          value={data.features ? formatDecimal(data.features.meanEngagement, 2) : "—"}
          hint={
            data.cohortAverages
              ? `cohort avg ${formatDecimal(data.cohortAverages.engagement, 2)}`
              : undefined
          }
        />
        <MetricCard
          label="Mean RDI"
          value={data.features ? formatDecimal(data.features.meanRdi, 2) : "—"}
          hint={
            data.cohortAverages
              ? `cohort avg ${formatDecimal(data.cohortAverages.rdi, 2)}`
              : undefined
          }
        />
      </section>

      {data.features ? (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Engagement consistency"
            value={formatDecimal(data.features.engagementConsistency, 2)}
            hint="0 = volatile, 1 = stable"
          />
          <MetricCard
            label="Engagement trend"
            value={formatDelta(data.features.engagementTrend, 3)}
            hint="slope per week"
          />
          <MetricCard
            label="Quiz consistency"
            value={formatDecimal(data.features.quizConsistency, 2)}
          />
          <MetricCard
            label="Assessment trend"
            value={formatDelta(data.features.assessmentTrend, 3)}
            hint="slope per week"
          />
        </section>
      ) : null}

      {data.timeline.length > 0 ? (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Weekly engagement & RDI</h2>
            <p className="text-xs text-slate-500 mb-3">
              Both metrics are normalised to [0, 1].
            </p>
            <TrendChart
              series={[engagementSeries, rdiSeries]}
              yMin={0}
              yMax={1}
              caption={`Weekly engagement and RDI for ${data.student.externalId}`}
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Weekly quiz performance</h2>
            <p className="text-xs text-slate-500 mb-3">
              Average quiz score, shown on the same 0–1 scale (50 → 0.5).
            </p>
            <TrendChart
              series={[quizSeries]}
              yMin={0}
              yMax={1}
              caption={`Weekly quiz averages for ${data.student.externalId}`}
              yLabel="Quiz/100"
            />
          </div>
        </section>
      ) : null}

      <PredictionVsInterventionCard
        studentExternalId={data.student.externalId}
        prediction={data.prediction}
        interventions={data.interventions}
      />

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recommended interventions</h2>
            <p className="text-xs text-slate-500 mt-1">
              Ranked by projected gain × headroom × confidence — see{" "}
              <Link href="/causal-graph" className="text-indigo-700 hover:underline">
                Causal Graph
              </Link>{" "}
              for the assumptions behind these estimates.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Total activity: {data.features ? formatNumber(data.features.totalActivity) : "—"} events
            over {data.features ? data.features.weeksObserved : "—"} weeks
          </p>
        </div>

        <HonestyNote>
          Each card shows a <strong>cohort-average effect applied to this student</strong>, the
          projected grade change, and a bootstrap confidence range. Confidence chips reflect Phase
          3 refutation checks. Low-confidence recommendations are shown — never hidden — so you
          can decide for yourself.
        </HonestyNote>

        {data.interventions.length === 0 ? (
          <EmptyState
            title="No interventions yet"
            description={
              <>
                Run <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:simulate</code>{" "}
                to generate intervention rows for this student.
              </>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.interventions.map((intv, i) => (
              <InterventionCard
                key={intv.interventionName}
                intervention={intv}
                rank={i + 1}
                decision={data.decisions.get(intv.interventionSimulationId) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {data.interventions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Intervention timeline
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Chronological feed of recommendations, advisor decisions, notes,
                and observational follow-ups for this student. The timeline is{" "}
                <strong>observational</strong> — it does not validate the causal
                model.
              </p>
            </div>
          </div>
          <InterventionTimeline events={data.interventionEvents} />
        </section>
      )}

      <section className="text-[11px] text-slate-400">
        Treatments map to DAG nodes: see{" "}
        {(["ResourceDiversityIndex", "ForumParticipation", "QuizConsistency", "AssessmentTrend"] as const).map(
          (t, i, arr) => (
            <span key={t}>
              {featureLabel(t)}
              {i < arr.length - 1 ? ", " : ""}
            </span>
          ),
        )}
        .
      </section>
    </div>
  );
}
