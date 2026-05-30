/**
 * Phase 10 — per-mode metadata catalogue.
 *
 * The single source of truth for human-facing mode descriptions, accent
 * colours, and refresh hints. Everything else (banner, /datasets page,
 * report renderer, server action) reads from this catalogue so the
 * copy stays consistent.
 */

import {
  DATASET_MODES,
  type DatasetMode,
  type DatasetModeMetadata,
} from "./types";

export const DATASET_MODE_METADATA: Record<DatasetMode, DatasetModeMetadata> = {
  synthetic: {
    id: "synthetic",
    name: "Synthetic Demo Dataset",
    tagline: "Generated demonstration data",
    description:
      "A deterministic, fully anonymous LMS-style dataset produced by `scripts/generate_synthetic_dataset.py`. Five behaviour groups, 250 students × 14 weeks, ~49,000 events. The default mode — no external system, no install steps, guaranteed reproducible for screenshots and tests.",
    verb: "Generated",
    accent: "indigo",
    recommendedFor:
      "First-run demos, screenshots, tests, recruiter walkthroughs. Use this when you want the same numbers every time.",
    refreshHint: "npm run data:generate && npm run db:ingest",
  },
  "shell-university": {
    id: "shell-university",
    name: "Shell University API Sync",
    tagline: "Mock LMS integration",
    description:
      "A fake Moodle/Canvas-style university exposed at `/api/shell-university/*`. The connector at `src/server/sync/shell-university/` pulls the typed contract, maps it to EduRAG's Prisma shape, and writes a `SyncLog` row per run. The shape a real LMS adapter would target — only the base URL + the mapper change.",
    verb: "Synced",
    accent: "emerald",
    recommendedFor:
      "Showing the LMS-integration story to a technical reviewer. Use this mode when you want to demonstrate that EduRAG can sync from an external HTTP contract.",
    refreshHint: "npm run shell:seed && npm run sync:university",
  },
  uploaded: {
    id: "uploaded",
    name: "Uploaded CSV Dataset",
    tagline: "User-provided LMS dataset",
    description:
      "A real CSV uploaded through the `/upload` page. The server validates the CSV row-by-row, previews stats + errors before commit, and runs the full ingest → derive → estimate → simulate → predict pipeline in place. Persists a `SyncLog` row with source = uploaded so this overview page reflects the import.",
    verb: "Uploaded",
    accent: "amber",
    recommendedFor:
      "Bring-your-own-data demos. Use this mode when you want to show the platform working on a dataset that is not the synthetic generator and not the mock LMS.",
    refreshHint: "Open /upload and submit a CSV (drag-drop, validate, commit).",
  },
};

export function metadataFor(mode: DatasetMode): DatasetModeMetadata {
  return DATASET_MODE_METADATA[mode];
}

/** Iterable list of every supported mode, in canonical order. */
export const ALL_MODES: ReadonlyArray<DatasetModeMetadata> = DATASET_MODES.map(
  (m) => DATASET_MODE_METADATA[m],
);

/** Type-guard for arbitrary strings parsed off disk or query strings. */
export function isDatasetMode(value: unknown): value is DatasetMode {
  return (
    typeof value === "string" &&
    (DATASET_MODES as ReadonlyArray<string>).includes(value)
  );
}
