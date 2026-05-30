/**
 * Phase 10 — canonical dataset-mode types.
 *
 * EduRAG supports three data sources, each with its own ingest pipeline
 * but the same downstream causal + prediction layers. The "dataset mode"
 * is the user's declared answer to "which source is currently
 * canonical?" — a piece of *intent* that drives the UI banners, the
 * /datasets overview, and the report metadata.
 *
 * Switching modes does NOT wipe the database — Phase 9's
 * `npm run reset:demo` covers that. Switching only updates the
 * persisted intent + surfaces the appropriate refresh hints. Keep this
 * file pure; the side-effectful store lives in `src/server/dataset-mode/`.
 */

export const DATASET_MODES = ["synthetic", "shell-university", "uploaded"] as const;

export type DatasetMode = (typeof DATASET_MODES)[number];

export type DatasetModeStatus =
  | "ready" // mode has data backing it; can be the active source
  | "empty" // mode is supported but no data exists yet
  | "stale" // data exists but no recent refresh — informational
  | "unavailable"; // mode cannot be activated right now (missing prerequisites)

/** Stable per-mode metadata — descriptions, recommended usage, theme colour. */
export interface DatasetModeMetadata {
  id: DatasetMode;
  /** Short headline ("Synthetic Demo Dataset"). */
  name: string;
  /** One-line tagline rendered next to the chip. */
  tagline: string;
  /** Paragraph-length description rendered on /datasets and /about. */
  description: string;
  /** "Generated" | "Synced" | "Uploaded" — the verb that describes how data arrived. */
  verb: "Generated" | "Synced" | "Uploaded";
  /** Tailwind colour token used by the banner / chip. */
  accent: "indigo" | "emerald" | "amber";
  /** Recommended use case — surfaced on /datasets. */
  recommendedFor: string;
  /** Shell command that refreshes / populates this mode. Surfaced as a hint. */
  refreshHint: string;
}

/**
 * Runtime status snapshot — derived on demand, not persisted. Combines
 * per-mode counts (Students for synthetic, latest SyncLog for the
 * external sources) with the metadata so the UI never has to glue them
 * back together.
 */
export interface DatasetModeSnapshot {
  metadata: DatasetModeMetadata;
  status: DatasetModeStatus;
  /** Human-readable last-update detail (e.g. "10 rows synced 2026-05-28T…"). */
  lastUpdatedDetail: string | null;
  /** ISO timestamp of the most-recent activity for this mode, when available. */
  lastUpdatedAt: string | null;
  /** Per-mode primary row count (Students for synthetic; SyncLog count for the others). */
  primaryCount: number;
  /** True for the mode currently marked active in the persisted state file. */
  isActive: boolean;
}

/** Shape persisted to `data/processed/dataset-mode.json`. */
export interface DatasetModeStateFile {
  /** Active mode the user has declared canonical. */
  activeMode: DatasetMode;
  /** ISO timestamp of the last `setActiveDatasetMode` call. */
  switchedAt: string;
  /** Free-text reason — useful for the /datasets history strip. */
  reason: string | null;
}

/** Default state used when no state file exists yet. */
export const DEFAULT_DATASET_STATE: DatasetModeStateFile = {
  activeMode: "synthetic",
  switchedAt: "1970-01-01T00:00:00.000Z",
  reason: "Default — no explicit selection made yet.",
};
