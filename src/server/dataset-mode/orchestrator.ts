/**
 * Phase 10 — dataset-mode orchestrator.
 *
 * The thin layer that glues the persisted state (Phase 12B: a row in
 * `AppSetting`) to Prisma probes + the pure snapshot/metadata helpers.
 * Used by:
 *
 *   - the global `<DatasetModeBanner>` on shared layout headers
 *   - the `/datasets` overview + switcher page
 *   - the `setActiveDatasetMode` server action
 *   - the report renderer (Phase 7) to stamp each report with its source
 *
 * Switching modes is **non-destructive** — it only updates the persisted
 * intent. Phase 9's `npm run reset:demo` covers the wipe story; the
 * orchestrator surfaces the appropriate refresh hint for the chosen mode
 * but never auto-runs the relevant CLI.
 */

import type { PrismaClient } from "@prisma/client";

import {
  ALL_MODES,
  metadataFor,
  snapshotsFor,
  type DatasetMode,
  type DatasetModeMetadata,
  type DatasetModeSnapshot,
  type DatasetModeStateFile,
  type RawModeCounts,
  type RawModeLatestSync,
} from "@/features/dataset-modes";
import { prisma as defaultPrisma } from "@/lib/db";

import { readState, writeState, type AppSettingClient } from "./store";

export interface DatasetModeOverview {
  activeMode: DatasetMode;
  switchedAt: string;
  reason: string | null;
  activeMetadata: DatasetModeMetadata;
  snapshots: DatasetModeSnapshot[];
}

export async function getDatasetModeOverview(
  prisma: PrismaClient = defaultPrisma,
): Promise<DatasetModeOverview> {
  const [state, counts, latest] = await Promise.all([
    readState({ prisma: prisma as unknown as AppSettingClient }),
    fetchCounts(prisma),
    fetchLatestSyncs(prisma),
  ]);
  return {
    activeMode: state.activeMode,
    switchedAt: state.switchedAt,
    reason: state.reason,
    activeMetadata: metadataFor(state.activeMode),
    snapshots: snapshotsFor(state.activeMode, counts, latest),
  };
}

export async function getActiveDatasetMode(
  prisma: PrismaClient = defaultPrisma,
): Promise<DatasetMode> {
  const state = await readState({ prisma: prisma as unknown as AppSettingClient });
  return state.activeMode;
}

/**
 * Persist the new active mode and return the updated state. Idempotent
 * when called with the current active mode (still rewrites the row with
 * a fresh timestamp + reason).
 */
export async function setActiveDatasetMode(
  mode: DatasetMode,
  reason: string | null = null,
  prisma: PrismaClient = defaultPrisma,
): Promise<DatasetModeStateFile> {
  const next: DatasetModeStateFile = {
    activeMode: mode,
    switchedAt: new Date().toISOString(),
    reason,
  };
  await writeState(next, { prisma: prisma as unknown as AppSettingClient });
  return next;
}

/** All mode metadata + (optionally) flagged active mode. Useful for /about + /datasets. */
export function listModeMetadata(): ReadonlyArray<DatasetModeMetadata> {
  return ALL_MODES;
}

// ---- Prisma probes --------------------------------------------------------

async function fetchCounts(prisma: PrismaClient): Promise<RawModeCounts> {
  const [studentCount, shellUniversitySyncs, uploadSyncs] = await Promise.all([
    prisma.student.count(),
    prisma.syncLog.count({ where: { source: "shell-university" } }),
    prisma.syncLog.count({ where: { source: "uploaded" } }),
  ]);
  return { studentCount, shellUniversitySyncs, uploadSyncs };
}

async function fetchLatestSyncs(prisma: PrismaClient): Promise<RawModeLatestSync> {
  const [shellRow, uploadRow] = await Promise.all([
    prisma.syncLog.findFirst({
      where: { source: "shell-university" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, status: true },
    }),
    prisma.syncLog.findFirst({
      where: { source: "uploaded" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, status: true },
    }),
  ]);
  return {
    shellUniversity: shellRow
      ? { finishedAt: shellRow.finishedAt, status: shellRow.status }
      : null,
    uploaded: uploadRow
      ? { finishedAt: uploadRow.finishedAt, status: uploadRow.status }
      : null,
  };
}
