/**
 * Phase 10 — /datasets overview + switcher.
 *
 * One page for: (a) what data sources EduRAG supports, (b) which one is
 * active right now, (c) the per-mode status (Ready / Empty), (d) how to
 * refresh each one, (e) a non-destructive switcher.
 *
 * Server component. Reads the persisted state + Prisma counts on every
 * request — the page is dynamic.
 */

import { getDatasetModeOverview } from "@/server/dataset-mode";
import { formatRelative } from "@/features/dataset-modes";

import DatasetModeSwitcher from "@/components/DatasetModeSwitcher";
import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const overview = await getDatasetModeOverview();
  const switchedAtDate = new Date(overview.switchedAt);
  const switchedDetail =
    Number.isNaN(switchedAtDate.getTime()) || overview.switchedAt.startsWith("1970")
      ? "default selection (no explicit switch recorded)"
      : `last switched ${formatRelative(switchedAtDate)}${overview.reason ? ` — "${overview.reason}"` : ""}`;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <PageHeader
        title="Dataset modes"
        subtitle="EduRAG works against three independent data sources. This page shows which one is currently canonical, lets you switch between them, and documents how to refresh each."
      />

      <HonestyNote tone="info" title="Switching is non-destructive">
        Switching the active mode updates the dashboard's <em>declared
        source</em> — it does not wipe the database or trigger an automatic
        re-bootstrap. Use <code className="font-mono">npm run reset:demo -- --yes</code>{" "}
        for a clean slate, or the per-mode <strong>Refresh</strong> hint to
        repopulate just one source.
      </HonestyNote>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Currently active
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {overview.activeMetadata.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {overview.activeMetadata.description}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>{switchedDetail}</p>
            <p className="mt-1">
              Refresh:{" "}
              <code className="font-mono rounded bg-slate-100 px-1.5 py-0.5">
                {overview.activeMetadata.refreshHint}
              </code>
            </p>
          </div>
        </div>
      </section>

      <DatasetModeSwitcher snapshots={overview.snapshots} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Why three modes?</h2>
        <ul className="list-disc pl-6 space-y-2 text-sm text-slate-700">
          <li>
            <strong>Synthetic</strong> is the reproducible default — the same
            numbers every run, perfect for screenshots and tests.
          </li>
          <li>
            <strong>Shell University</strong> is the integration story — a
            real-shaped HTTP contract behind a typed connector. Swap the base
            URL + mapper to wire a real LMS.
          </li>
          <li>
            <strong>Uploaded</strong> is the bring-your-own-data story — drop
            a CSV at <code className="font-mono">/upload</code> and the full
            pipeline runs in place.
          </li>
        </ul>
        <p className="text-xs text-slate-500">
          The mode also appears on every causal / comparison report so a
          reviewer reading the Markdown export can see immediately which source
          produced the numbers.
        </p>
      </section>
    </div>
  );
}
