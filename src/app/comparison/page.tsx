/**
 * Phase 8 — cohort-level "Prediction vs Intervention" page.
 *
 * One row per student showing the two layers side-by-side at a glance.
 * If either side is missing for a student, the cell shows "—" — never
 * fabricates output.
 */

import Link from "next/link";

import { buildComparison } from "@/features/baseline-ml";
import type { PredictionResult } from "@/features/baseline-ml";
import { formatDelta } from "@/lib/formatters";
import {
  interventionLabel,
  predictionFeatureLabel,
} from "@/lib/intervention-language";
import { prisma } from "@/lib/db";
import { getDatasetModeOverview } from "@/server/dataset-mode";
import { getPredictionsForCourse } from "@/server/queries/predictions";

import ConfidenceChip from "@/components/ConfidenceChip";
import EmptyState from "@/components/EmptyState";
import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const DEFAULT_COURSE = "CS-201";

interface PageProps {
  searchParams?: Promise<{ course?: string }>;
}

export default async function ComparisonPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const courseCode = params.course ?? DEFAULT_COURSE;

  const [predictions, course, datasetOverview] = await Promise.all([
    getPredictionsForCourse(courseCode),
    prisma.course.findUnique({ where: { code: courseCode } }),
    getDatasetModeOverview(),
  ]);
  const activeMode = datasetOverview.activeMetadata;

  const interventionRows = course
    ? await prisma.interventionSimulation.findMany({
        where: { courseId: course.id },
        orderBy: [{ studentId: "asc" }, { rankScore: "desc" }],
        include: { student: { select: { externalId: true } } },
      })
    : [];

  const interventionsByStudent = new Map<string, typeof interventionRows>();
  for (const row of interventionRows) {
    const list = interventionsByStudent.get(row.student.externalId) ?? [];
    list.push(row);
    interventionsByStudent.set(row.student.externalId, list);
  }

  const studentIds = new Set<string>();
  for (const p of predictions) studentIds.add(p.studentExternalId);
  for (const e of interventionsByStudent.keys()) studentIds.add(e);

  const rows = [...studentIds].sort().map((externalId) => {
    const prediction = predictions.find((p) => p.studentExternalId === externalId);
    const interventions = interventionsByStudent.get(externalId) ?? [];
    const predictionResult: PredictionResult | null = prediction
      ? {
          studentId: prediction.studentId,
          courseId: course?.id ?? "",
          modelType: prediction.modelType,
          predictedRiskProb: prediction.predictedRiskProb,
          predictedGrade: prediction.predictedGrade,
          riskClass: prediction.riskClass,
          threshold: prediction.threshold,
          confidence: prediction.confidence,
          featureImportance: prediction.featureImportance,
          notes: prediction.notes,
          warnings: [],
        }
      : null;
    const summary = buildComparison({
      studentId: externalId,
      prediction: predictionResult,
      interventions: interventions.map((row) => ({
        interventionSimulationId: row.id,
        interventionName: row.interventionName,
        treatment: row.treatment as never,
        baselineValue: row.baselineValue,
        proposedValue: row.proposedValue,
        appliedDelta: row.appliedDelta,
        estimatedEffect: row.estimatedEffect,
        baselineGrade: row.baselineGrade,
        projectedGrade: row.projectedGrade,
        projectedLow: row.projectedLow,
        projectedHigh: row.projectedHigh,
        rankScore: row.rankScore,
        confidence: row.confidence as never,
        explanation: row.explanation,
      })),
    });
    return {
      externalId,
      prediction,
      topIntervention: interventions[0] ?? null,
      summary,
    };
  });

  const agreements = rows.filter((r) => {
    const insights = r.summary.insights;
    return insights.some((i) => i.headline.startsWith("Prediction and intervention agree"));
  }).length;
  const disagreements = rows.filter((r) => {
    const insights = r.summary.insights;
    return insights.some((i) =>
      i.headline.startsWith("Prediction and intervention point at different"),
    );
  }).length;

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title="Prediction vs Intervention"
        subtitle={
          course
            ? `${course.code} · ${course.title} — both layers side-by-side · ${activeMode.verb} via ${activeMode.name}`
            : `Course ${courseCode} not found`
        }
        action={
          <div className="flex gap-2">
            <Link
              href={`/api/causal/report?course=${encodeURIComponent(courseCode)}&format=markdown&prediction=1`}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Markdown report
            </Link>
            <Link
              href={`/api/causal/report?course=${encodeURIComponent(courseCode)}&format=json&prediction=1`}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              JSON report
            </Link>
          </div>
        }
      />

      <HonestyNote tone="info" title="Reading this page">
        Left of each row: traditional ML — predicted risk probability and the
        strongest predictor. Right of each row: EduRAG&apos;s causal layer — the
        top-ranked intervention and its projected lift. The two layers answer
        different questions; we render both so you can compare.
      </HonestyNote>

      {rows.length === 0 ? (
        <EmptyState
          title="No comparison data yet"
          description={
            <>
              Run{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run ml:predict</code>{" "}
              and{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:simulate</code>
              {" "}to populate this page.
            </>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <SummaryCard label="Students compared" value={rows.length.toString()} />
            <SummaryCard
              label="Predicted at-risk"
              value={rows.filter((r) => r.prediction?.riskClass === "at-risk").length.toString()}
              tone="warning"
            />
            <SummaryCard
              label="Agree on lever"
              value={agreements.toString()}
              tone="positive"
            />
            <SummaryCard
              label="Disagree on lever"
              value={disagreements.toString()}
            />
          </section>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">P(at-risk)</th>
                  <th className="px-4 py-3">Predicted class</th>
                  <th className="px-4 py-3">Top predictor</th>
                  <th className="px-4 py-3">Top intervention</th>
                  <th className="px-4 py-3">Projected gain</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const topPredictor = r.prediction?.featureImportance?.[0] ?? null;
                  const topIntv = r.topIntervention;
                  const gain = topIntv
                    ? topIntv.projectedGrade - topIntv.baselineGrade
                    : null;
                  return (
                    <tr key={r.externalId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-900">
                        <Link
                          href={`/students/${r.externalId}`}
                          className="text-indigo-700 hover:underline"
                        >
                          {r.externalId}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.prediction
                          ? `${(r.prediction.predictedRiskProb * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.prediction ? (
                          <RiskBadge level={r.prediction.riskClass} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {topPredictor
                          ? `${predictionFeatureLabel(topPredictor.feature)} (β = ${formatDelta(topPredictor.value, 2)})`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {topIntv ? interventionLabel(topIntv.interventionName) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {gain !== null ? (
                          <span className={gain >= 0.5 ? "text-emerald-700" : "text-slate-500"}>
                            {formatDelta(gain, 2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {topIntv ? (
                          <ConfidenceChip
                            level={topIntv.confidence as never}
                            size="sm"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Link
                          href={`/students/${r.externalId}`}
                          className="text-indigo-700 hover:underline"
                        >
                          Details →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">What this table is telling you</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-slate-700">
              <li>
                <strong>P(at-risk)</strong> comes from a logistic-regression baseline trained on the
                cohort&apos;s feature table. It is a probability, not a prediction of a specific number.
              </li>
              <li>
                <strong>Top predictor</strong> is the feature with the largest absolute standardised
                coefficient. <em>Feature importance ≠ causal effect.</em>
              </li>
              <li>
                <strong>Top intervention</strong> comes from the Phase 4 causal simulator: the
                highest-ranked counterfactual move for this student, accounting for headroom and
                refutation confidence.
              </li>
              <li>
                The <em>Agree on lever</em> / <em>Disagree on lever</em> counts above tell you on how
                many students the strongest predictor and the strongest intervention target are the
                same feature. Disagreement is not a bug — predictive importance and causal effect
                genuinely differ.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning";
}) {
  const toneClasses =
    tone === "warning"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : tone === "positive"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg border px-4 py-3 shadow-sm ${toneClasses}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function RiskBadge({ level }: { level: "at-risk" | "borderline" | "on-track" }) {
  const styles = {
    "at-risk": "bg-rose-100 text-rose-800 border-rose-200",
    borderline: "bg-amber-100 text-amber-900 border-amber-200",
    "on-track": "bg-emerald-100 text-emerald-800 border-emerald-200",
  } as const;
  const label = {
    "at-risk": "At risk",
    borderline: "Borderline",
    "on-track": "On track",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[level]}`}
    >
      {label[level]}
    </span>
  );
}
