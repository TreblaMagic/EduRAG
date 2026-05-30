import Link from "next/link";

import { toDagJson } from "@/features/causal-engine";
import { getCausalEstimatesForCourse } from "@/server/queries/causal";
import { runCausalDiscovery } from "@/server/causal/run-discovery";
import { prisma } from "@/lib/db";
import { formatDecimal } from "@/lib/formatters";
import { featureLabel } from "@/lib/intervention-language";

import CausalGraphView from "@/components/CausalGraphView";
import ConfidenceChip from "@/components/ConfidenceChip";
import DiscoveredGraphView from "@/components/DiscoveredGraphView";
import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const DEFAULT_COURSE = "CS-201";

type ViewMode = "manual" | "discovered" | "compare";
type EngineParam = "baseline" | "advanced";

interface PageProps {
  searchParams?: Promise<{
    view?: string;
    engine?: string;
    course?: string;
  }>;
}

export default async function CausalGraphPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const courseCode = params.course ?? DEFAULT_COURSE;
  const view = normaliseView(params.view);
  const engine = normaliseEngine(params.engine);

  const dag = toDagJson();
  const estimates = await getCausalEstimatesForCourse(courseCode);

  const discovery =
    view === "manual"
      ? null
      : await runCausalDiscovery(prisma, courseCode, { engine }).catch((e: unknown) => ({
          error: e instanceof Error ? e.message : String(e),
        }));

  const discoveryError =
    discovery && "error" in discovery ? (discovery as { error: string }).error : null;
  const discoveryResult = discovery && !discoveryError ? (discovery as Awaited<ReturnType<typeof runCausalDiscovery>>) : null;

  const reportHref = `/api/causal/report?course=${encodeURIComponent(courseCode)}&format=markdown&discovery=1&engine=${engine}`;
  const reportJsonHref = `/api/causal/report?course=${encodeURIComponent(courseCode)}&format=json&discovery=1&engine=${engine}`;

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title="Causal graph"
        subtitle="The hypothesised causal structure used by the estimator and the what-if simulator, side-by-side with a data-driven discovery experiment."
      />

      <HonestyNote tone="warning" title="What this page is — and isn't">
        The <strong>manual DAG</strong> encodes the project's <em>domain assumptions</em>.
        The <strong>discovered DAG</strong> is a <em>statistical inference experiment</em>
        run on the same cohort. Both views are explanatory tools — neither is proof of
        real-world causation. Effect estimates derived from the manual DAG remain the
        production analytical output; the discovered DAG is shown for transparency.
      </HonestyNote>

      <ViewSwitcher view={view} engine={engine} courseCode={courseCode} />

      {view === "manual" && <CausalGraphView dag={dag} />}

      {view === "discovered" && (
        <DiscoverySection error={discoveryError} discovery={discoveryResult} dag={dag} />
      )}

      {view === "compare" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Manual (domain assumptions)</h3>
            <CausalGraphView dag={dag} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Discovered (PC experiment)</h3>
            <DiscoverySection error={discoveryError} discovery={discoveryResult} dag={dag} />
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Estimated effects on Final Grade
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Backdoor-adjusted estimator with bootstrap CI. Adjustment set =
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">
                {`{PriorGPA, Engagement} \\ {treatment}`}
              </code>
              . Refutations include placebo (shuffled treatment), random common
              cause, and (when enabled) subset robustness + bootstrap stability +
              sensitivity + outcome permutation.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={reportHref}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Download Markdown report
            </Link>
            <Link
              href={reportJsonHref}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Download JSON report
            </Link>
          </div>
        </div>

        {estimates.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
            No causal estimates yet. Run{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:estimate</code> to
            populate this view.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Treatment</th>
                  <th className="px-4 py-3">β estimate</th>
                  <th className="px-4 py-3">95% CI</th>
                  <th className="px-4 py-3">Sample</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estimates.map((e) => (
                  <tr key={e.treatment}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {featureLabel(e.treatment)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDecimal(e.estimate, 2)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      [{formatDecimal(e.ciLow, 2)}, {formatDecimal(e.ciHigh, 2)}]
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.sampleSize}</td>
                    <td className="px-4 py-3 text-slate-700">{e.method}</td>
                    <td className="px-4 py-3">
                      <ConfidenceChip level={e.confidence} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {e.adjustmentSet.length > 0 ? e.adjustmentSet.join(", ") : "∅"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function normaliseView(raw: string | undefined): ViewMode {
  if (raw === "discovered" || raw === "compare") return raw;
  return "manual";
}

function normaliseEngine(raw: string | undefined): EngineParam {
  return raw === "advanced" ? "advanced" : "baseline";
}

function ViewSwitcher({
  view,
  engine,
  courseCode,
}: {
  view: ViewMode;
  engine: EngineParam;
  courseCode: string;
}) {
  const link = (target: ViewMode, label: string) => {
    const active = view === target;
    return (
      <Link
        key={target}
        href={`/causal-graph?course=${encodeURIComponent(courseCode)}&engine=${engine}&view=${target}`}
        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
          active
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
      </Link>
    );
  };
  const engineLink = (target: EngineParam, label: string) => {
    const active = engine === target;
    return (
      <Link
        key={target}
        href={`/causal-graph?course=${encodeURIComponent(courseCode)}&engine=${target}&view=${view}`}
        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
          active
            ? "bg-indigo-600 text-white"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-500">View</span>
        {link("manual", "Manual DAG")}
        {link("discovered", "Discovered DAG")}
        {link("compare", "Compare")}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Engine</span>
        {engineLink("baseline", "Baseline (TypeScript)")}
        {engineLink("advanced", "Advanced (Python)")}
      </div>
    </div>
  );
}

function DiscoverySection({
  error,
  discovery,
  dag,
}: {
  error: string | null;
  discovery: Awaited<ReturnType<typeof runCausalDiscovery>> | null;
  dag: ReturnType<typeof toDagJson>;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Discovery failed.</p>
        <p className="mt-1 text-xs">{error}</p>
        <p className="mt-2 text-xs">
          Re-run with the baseline engine (no Python required) or ensure{" "}
          <code className="font-mono">npm run db:ingest</code> has produced
          enough feature rows.
        </p>
      </div>
    );
  }
  if (!discovery) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
        Loading discovery…
      </div>
    );
  }
  return (
    <DiscoveredGraphView
      dag={dag}
      discovered={{
        algorithm: discovery.algorithm,
        alpha: discovery.alpha,
        edges: discovery.edges,
        shared: discovery.diff.shared,
        discoveredOnly: discovery.diff.discoveredOnly,
        manualOnly: discovery.diff.manualOnly,
        warnings: discovery.warnings,
        engine: discovery.engineResolved,
      }}
    />
  );
}
