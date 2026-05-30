import { getDashboardData } from "@/server/queries/dashboard";
import { getDatasetModeOverview } from "@/server/dataset-mode";
import { featureLabel } from "@/lib/intervention-language";
import {
  formatDecimal,
  formatGrade,
  formatNumber,
} from "@/lib/formatters";

import EmptyState from "@/components/EmptyState";
import HonestyNote from "@/components/HonestyNote";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import StudentTable from "@/components/StudentTable";

// The dashboard reads the live SQLite DB; never cache it at the route layer.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [data, datasetOverview] = await Promise.all([
    getDashboardData(),
    getDatasetModeOverview(),
  ]);
  const activeMode = datasetOverview.activeMetadata;
  const courseLine = data.course
    ? `${data.course.code} · ${data.course.title}`
    : "No course data yet";
  const subtitle = `${courseLine} · ${activeMode.verb} via ${activeMode.name}`;

  return (
    <div className="p-8 space-y-8">
      <PageHeader title="Overview" subtitle={subtitle} />

      {data.cohort.length === 0 ? (
        <EmptyState
          title="No cohort data yet"
          description={
            <>
              Run <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:ingest</code>{" "}
              and <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:estimate</code>{" "}
              followed by <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:simulate</code>{" "}
              to populate the dashboard.
            </>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <MetricCard
              label="Students"
              value={formatNumber(data.metrics.totalStudents)}
            />
            <MetricCard
              label="Courses"
              value={formatNumber(data.metrics.courseCount)}
            />
            <MetricCard
              label="Avg. final grade"
              value={formatGrade(data.metrics.averageFinalGrade)}
            />
            <MetricCard
              label="Avg. RDI"
              value={formatDecimal(data.metrics.averageRdi, 2)}
              hint="0 = single resource type; 1 = perfectly diverse"
            />
            <MetricCard
              label="At-risk students"
              value={formatNumber(data.metrics.atRiskCount)}
              hint="final grade < 55"
              emphasis="warning"
            />
            <MetricCard
              label="Strongest driver"
              value={
                data.metrics.strongestDriver
                  ? featureLabel(data.metrics.strongestDriver.treatment as never)
                  : "—"
              }
              hint={
                data.metrics.strongestDriver
                  ? `β = ${formatDecimal(data.metrics.strongestDriver.estimate, 2)}`
                  : undefined
              }
            />
          </section>

          <HonestyNote>
            Estimates and recommended interventions are <strong>model-based</strong> projections
            from a cohort-level causal regression with bootstrap confidence intervals. Every
            recommendation carries a confidence chip and an improvement range — values are not
            guaranteed personal effects.
          </HonestyNote>

          <section className="space-y-3">
            <div className="flex items-end justify-between">
              <h2 className="text-base font-semibold text-slate-900">Cohort</h2>
              <p className="text-xs text-slate-500">
                Sorted by final grade ascending — at-risk students first.
              </p>
            </div>
            <StudentTable rows={data.cohort} />
          </section>
        </>
      )}
    </div>
  );
}
