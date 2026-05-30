/**
 * Phase 10 — small "current data source" indicator.
 *
 * Server component. Reads the persisted active mode + a count to surface
 * a colour-coded chip and a one-line detail. Designed for the
 * header strip of pages where the data source matters to interpretation
 * (Overview, /comparison, /causal-graph, /students/[id]).
 *
 * Click anywhere on the chip to jump to `/datasets` (the overview +
 * switcher page). The chip never blocks — if the mode store is missing
 * or unreadable it falls back to the synthetic default.
 */

import Link from "next/link";

import {
  DEFAULT_DATASET_STATE,
  metadataFor,
  type DatasetMode,
  type DatasetModeMetadata,
} from "@/features/dataset-modes";

import { getDatasetModeOverview } from "@/server/dataset-mode";

interface Props {
  /** Optional override — pass when the parent already fetched the overview. */
  mode?: DatasetMode;
  /** Optional secondary line (e.g. "Last sync: 2m ago"). */
  detail?: string;
  /** Compact variant for tight headers. */
  compact?: boolean;
}

/**
 * Phase 12A CI fix: never let a missing/unmigrated database crash the
 * shared layout. `getDatasetModeOverview` does Prisma probes; on a fresh
 * build container (or any environment where the schema hasn't been
 * applied) those probes can throw. We catch and fall back to the
 * default mode so the page still renders — broken DB shows the default
 * chip, not a 500.
 */
async function resolveActiveMode(): Promise<DatasetMode> {
  try {
    return (await getDatasetModeOverview()).activeMode;
  } catch {
    return DEFAULT_DATASET_STATE.activeMode;
  }
}

const ACCENT_CLASSES: Record<DatasetModeMetadata["accent"], string> = {
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
};

const DOT_CLASSES: Record<DatasetModeMetadata["accent"], string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

export default async function DatasetModeBanner({
  mode,
  detail,
  compact = false,
}: Props) {
  const resolvedMode = mode ?? (await resolveActiveMode());
  const metadata = metadataFor(resolvedMode);

  const summary = detail ?? metadata.tagline;

  return (
    <Link
      href="/datasets"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm hover:shadow transition-shadow ${ACCENT_CLASSES[metadata.accent]}`}
      aria-label={`Active dataset source: ${metadata.name}. Open /datasets to switch.`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASSES[metadata.accent]}`} />
      <span className="font-semibold">{metadata.name}</span>
      {!compact && (
        <span className="text-[11px] font-normal opacity-80">· {summary}</span>
      )}
    </Link>
  );
}
