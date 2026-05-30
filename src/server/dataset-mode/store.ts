/**
 * Phase 10 — persistence layer for the active dataset mode.
 *
 * Storage choice (Phase 12B):
 *
 *   - Persisted as a single row in the `AppSetting` table
 *     (`key = "dataset-mode"`). Replaces the Phase 10 JSON file at
 *     `data/processed/dataset-mode.json` so the active mode survives on
 *     a read-only / serverless filesystem (Vercel).
 *   - The stored `value` is the JSON-encoded `DatasetModeStateFile`
 *     payload — same shape as the old file, so a one-line backfill is
 *     all that is needed to move existing local state into the DB.
 *
 * Invariants preserved from Phase 10:
 *
 *   - `readState()` never throws. Missing row / malformed JSON / invalid
 *     mode all fall through to {@link DEFAULT_DATASET_STATE}.
 *   - `normaliseState()` is pure (no I/O) so tests can exercise the
 *     corruption-recovery path without touching the DB.
 *
 * Tests inject their own Prisma double via the `prisma` option; the
 * production callers omit it and pick up the shared client from
 * `@/lib/db`.
 */

import {
  DEFAULT_DATASET_STATE,
  isDatasetMode,
  type DatasetMode,
  type DatasetModeStateFile,
} from "@/features/dataset-modes";
import { prisma as defaultPrisma } from "@/lib/db";

const APP_SETTING_KEY = "dataset-mode";

/**
 * Minimal slice of `PrismaClient` the store needs. Defining the shape
 * here keeps the tests free of the generated Prisma type surface and
 * makes it obvious which fields the store actually touches.
 */
export interface AppSettingClient {
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ key: string; value: string } | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
}

export interface StoreOptions {
  /** Inject a Prisma-shaped client (used by tests + the seed script). */
  prisma?: AppSettingClient;
}

/**
 * Read the persisted state. Falls back to the default on any failure
 * (missing row, malformed JSON, invalid mode). Never throws.
 */
export async function readState(options: StoreOptions = {}): Promise<DatasetModeStateFile> {
  const client = options.prisma ?? (defaultPrisma as unknown as AppSettingClient);
  try {
    const row = await client.appSetting.findUnique({ where: { key: APP_SETTING_KEY } });
    if (!row) return { ...DEFAULT_DATASET_STATE };
    const parsed = JSON.parse(row.value) as Partial<DatasetModeStateFile>;
    return normaliseState(parsed);
  } catch {
    return { ...DEFAULT_DATASET_STATE };
  }
}

/**
 * Persist the new state. Idempotent — re-running with the same payload
 * simply rewrites the row.
 */
export async function writeState(
  state: DatasetModeStateFile,
  options: StoreOptions = {},
): Promise<void> {
  const client = options.prisma ?? (defaultPrisma as unknown as AppSettingClient);
  const safeState = normaliseState(state);
  const value = JSON.stringify(safeState);
  await client.appSetting.upsert({
    where: { key: APP_SETTING_KEY },
    create: { key: APP_SETTING_KEY, value },
    update: { value },
  });
}

/**
 * Validate + repair an unknown payload into a {@link DatasetModeStateFile}.
 * Pure — no I/O. Exported so tests (and the seed script) can exercise
 * the corruption-recovery path directly.
 */
export function normaliseState(
  raw: Partial<DatasetModeStateFile> | null | undefined,
): DatasetModeStateFile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DATASET_STATE };
  const mode: DatasetMode = isDatasetMode(raw.activeMode)
    ? raw.activeMode
    : DEFAULT_DATASET_STATE.activeMode;
  const switchedAt =
    typeof raw.switchedAt === "string" && !Number.isNaN(Date.parse(raw.switchedAt))
      ? raw.switchedAt
      : DEFAULT_DATASET_STATE.switchedAt;
  const reason =
    raw.reason === null
      ? null
      : typeof raw.reason === "string"
        ? raw.reason
        : DEFAULT_DATASET_STATE.reason;
  return { activeMode: mode, switchedAt, reason };
}
