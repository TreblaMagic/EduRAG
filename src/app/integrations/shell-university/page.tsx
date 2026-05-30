import Link from "next/link";

import HonestyNote from "@/components/HonestyNote";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/formatters";
import { getIntegrationsPageData } from "@/server/queries/integrations";

export const dynamic = "force-dynamic";

const STATUS_CLASSES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-900 border-amber-200",
  failed: "bg-rose-100 text-rose-800 border-rose-200",
};

const SOURCE_CLASSES: Record<string, string> = {
  "Shell University API": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Synthetic CSV": "bg-slate-100 text-slate-700 border-slate-200",
  "Uploaded CSV": "bg-sky-100 text-sky-800 border-sky-200",
  Unknown: "bg-rose-100 text-rose-800 border-rose-200",
};

export default async function IntegrationsPage() {
  const data = await getIntegrationsPageData();

  return (
    <div className="px-8 py-10 max-w-7xl">
      <PageHeader
        title="Integrations · Shell University"
        subtitle="A mock external university / LMS system that EduRAG syncs from. In production, swap the base URL for a real Moodle / Canvas / Blackboard endpoint and the rest of the pipeline stays unchanged."
        action={
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
              SOURCE_CLASSES[data.currentSource] ?? SOURCE_CLASSES.Unknown,
            )}
          >
            Current data source: {data.currentSource}
          </span>
        }
      />

      <HonestyNote tone="info" title="This is a mock integration">
        Shell University reads from a local JSON store seeded from the synthetic CSV. The HTTP routes, sync
        contract, and translation layer mirror what a real LMS integration would require — but the dataset
        itself is synthetic.
      </HonestyNote>

      {/* ----- Mock service health + sync status ----- */}
      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Mock service"
          value={data.mock.health ? "Healthy" : "Not seeded"}
          emphasis={data.mock.health ? "positive" : "warning"}
          hint={
            data.mock.health
              ? `Version ${data.mock.health.version} · term ${data.mock.health.current_term}`
              : "Run npm run shell:seed"
          }
        />
        <MetricCard
          label="Last data update"
          value={
            data.mock.syncStatus
              ? new Date(data.mock.syncStatus.last_data_update).toLocaleString()
              : "—"
          }
          hint={data.mock.syncStatus ? `Data version ${data.mock.syncStatus.data_version}` : undefined}
        />
        <MetricCard
          label="Total syncs recorded"
          value={formatNumber(data.totalSyncs)}
          hint="EduRAG-side SyncLog rows"
        />
        <MetricCard
          label="Advisor notes synced"
          value={formatNumber(data.prismaCounts.advisorNotes)}
          hint="New entity introduced by this integration"
        />
      </section>

      {/* ----- Sync history ----- */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Recent syncs</h2>
        <p className="mt-1 text-sm text-slate-500">
          Each row is a `SyncLog` entry written by `npm run sync:university`. Most recent first.
        </p>
        {data.recentSyncs.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
            No syncs yet. Run <code className="font-mono text-slate-700">npm run sync:university</code> to populate this view.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Entities synced</th>
                  <th className="px-4 py-3 text-left font-medium">Records upserted</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSyncs.map((row) => {
                  const totalUpserted = Object.values(row.summary).reduce((s, e) => s + e.upserted, 0);
                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {row.startedAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.source}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            STATUS_CLASSES[row.status] ?? STATUS_CLASSES.failed,
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.durationMs} ms</td>
                      <td className="px-4 py-3 text-slate-700">{row.scope.length}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{formatNumber(totalUpserted)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ----- Endpoint reference ----- */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">API endpoints</h2>
        <p className="mt-1 text-sm text-slate-500">
          All endpoints return the standard envelope <code className="font-mono text-slate-700">{`{ data: T[], meta: {...} }`}</code>.
          Health and sync-status endpoints return their own shapes.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Path</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {data.endpoints.map((ep) => (
                <tr key={ep.path} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-emerald-700 font-mono text-xs">GET</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-900">
                    <Link href={ep.path} className="hover:underline" target="_blank">
                      {ep.path}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ----- How sync works ----- */}
      <section className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">How sync works</h3>
          <ol className="mt-3 list-decimal list-inside text-sm text-slate-700 space-y-2">
            <li>
              <code className="font-mono text-xs">npm run shell:seed</code> generates JSON files from the synthetic CSV
              and writes them under <code className="font-mono text-xs">data/shell-university/</code>.
            </li>
            <li>
              The Next.js route handlers serve those files at <code className="font-mono text-xs">/api/shell-university/*</code>
              with a standard <code className="font-mono text-xs">{`{ data, meta }`}</code> envelope.
            </li>
            <li>
              <code className="font-mono text-xs">npm run sync:university</code> fetches each entity (direct file read by
              default; <code className="font-mono text-xs">--via-http</code> to use HTTP), validates the envelope, maps to
              Prisma shape, and upserts.
            </li>
            <li>
              Order matters: courses → students → enrollments → resources → events → grades → advisor-notes. Children depend
              on parents.
            </li>
            <li>
              Activity rows are wiped per <code className="font-mono text-xs">(studentId, courseId)</code> before bulk insert
              — same idempotency strategy as the CSV ingest.
            </li>
            <li>
              After sync, <code className="font-mono text-xs">WeeklyEngagementSummary</code>, <code className="font-mono text-xs">RdiScore</code>,
              and <code className="font-mono text-xs">CourseFeatureSummary</code> are re-derived automatically.
            </li>
          </ol>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Replacing Shell University with a real LMS</h3>
          <p className="mt-3 text-sm text-slate-700">
            The translation work — not the transport — is what makes this integration real. A production rollout looks like:
          </p>
          <ol className="mt-3 list-decimal list-inside text-sm text-slate-700 space-y-2">
            <li>
              Swap the base URL: <code className="font-mono text-xs">npm run sync:university -- --base https://your-lms.example.com</code>.
            </li>
            <li>
              Add an auth layer to the HTTP client (header / OAuth token / mTLS). No EduRAG code needs to know.
            </li>
            <li>
              Adjust the mapper if the LMS uses different field names (e.g. Moodle's <code className="font-mono text-xs">userid</code>
              instead of <code className="font-mono text-xs">learner_id</code>). The mapper is the single source of translation.
            </li>
            <li>
              Optionally split <code className="font-mono text-xs">/api/shell-university/*</code> out into a standalone service later.
              The contract is stable; the EduRAG sync layer doesn't care.
            </li>
          </ol>
        </div>
      </section>

      {/* ----- EduRAG-side counts ----- */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">EduRAG database snapshot</h2>
        <p className="mt-1 text-sm text-slate-500">Live counts from Prisma after the most recent sync.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard label="Students" value={formatNumber(data.prismaCounts.students)} />
          <MetricCard label="Courses" value={formatNumber(data.prismaCounts.courses)} />
          <MetricCard label="Activity logs" value={formatNumber(data.prismaCounts.activityLogs)} />
          <MetricCard label="Grades" value={formatNumber(data.prismaCounts.grades)} />
          <MetricCard label="Advisor notes" value={formatNumber(data.prismaCounts.advisorNotes)} />
        </div>
      </section>
    </div>
  );
}
