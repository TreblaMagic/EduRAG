/**
 * Phase 10 — derive runtime status snapshots for every dataset mode.
 *
 * Pure functions only — the database probes happen in
 * `src/server/dataset-mode/`. This module shapes the per-mode counts +
 * latest-sync timestamps into the {@link DatasetModeSnapshot} the UI
 * consumes.
 */

import { metadataFor } from "./metadata";
import {
  DATASET_MODES,
  type DatasetMode,
  type DatasetModeSnapshot,
  type DatasetModeStatus,
} from "./types";

export interface RawModeCounts {
  /** Total Student rows in Prisma — proxy for "synthetic ingest happened". */
  studentCount: number;
  /** Number of SyncLog rows with source = "shell-university". */
  shellUniversitySyncs: number;
  /** Number of SyncLog rows with source = "uploaded". */
  uploadSyncs: number;
}

export interface RawModeLatestSync {
  /** Latest `SyncLog.finishedAt` per source, or null if none. */
  shellUniversity: { finishedAt: Date; status: string } | null;
  uploaded: { finishedAt: Date; status: string } | null;
}

/**
 * Build a snapshot list — one per mode — using the raw counts +
 * latest-sync rows fetched by the caller. The caller also passes the
 * persisted active mode so the snapshot can flag `isActive`.
 */
export function snapshotsFor(
  activeMode: DatasetMode,
  counts: RawModeCounts,
  latest: RawModeLatestSync,
): DatasetModeSnapshot[] {
  return DATASET_MODES.map((mode) =>
    buildSnapshot(mode, mode === activeMode, counts, latest),
  );
}

function buildSnapshot(
  mode: DatasetMode,
  isActive: boolean,
  counts: RawModeCounts,
  latest: RawModeLatestSync,
): DatasetModeSnapshot {
  const metadata = metadataFor(mode);
  switch (mode) {
    case "synthetic": {
      const ready = counts.studentCount > 0;
      return {
        metadata,
        isActive,
        status: ready ? "ready" : "empty",
        primaryCount: counts.studentCount,
        lastUpdatedAt: null,
        lastUpdatedDetail: ready
          ? `${counts.studentCount.toLocaleString()} students currently in the database`
          : "No data yet — run `npm run setup` or `npm run db:ingest`",
      };
    }
    case "shell-university": {
      const ready = counts.shellUniversitySyncs > 0;
      const last = latest.shellUniversity;
      return {
        metadata,
        isActive,
        status: ready ? "ready" : "empty",
        primaryCount: counts.shellUniversitySyncs,
        lastUpdatedAt: last?.finishedAt.toISOString() ?? null,
        lastUpdatedDetail: ready
          ? `${counts.shellUniversitySyncs.toLocaleString()} sync${counts.shellUniversitySyncs === 1 ? "" : "s"} on record${last ? ` — last completed ${formatRelative(last.finishedAt)} (${last.status})` : ""}`
          : "No syncs on record — run `npm run shell:seed && npm run sync:university`",
      };
    }
    case "uploaded": {
      const ready = counts.uploadSyncs > 0;
      const last = latest.uploaded;
      return {
        metadata,
        isActive,
        status: ready ? "ready" : "empty",
        primaryCount: counts.uploadSyncs,
        lastUpdatedAt: last?.finishedAt.toISOString() ?? null,
        lastUpdatedDetail: ready
          ? `${counts.uploadSyncs.toLocaleString()} upload${counts.uploadSyncs === 1 ? "" : "s"} on record${last ? ` — last committed ${formatRelative(last.finishedAt)} (${last.status})` : ""}`
          : "No uploads yet — open `/upload` and submit a CSV",
      };
    }
  }
}

/** Human-readable relative-time string ("3 minutes ago"). Pure. */
export function formatRelative(then: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return then.toISOString();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Render the status as a short label suitable for a chip. */
export function statusLabel(status: DatasetModeStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "empty":
      return "Empty";
    case "stale":
      return "Stale";
    case "unavailable":
      return "Unavailable";
  }
}
