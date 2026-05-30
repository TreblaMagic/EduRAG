/**
 * Phase 10 — persistence layer for the active dataset mode.
 *
 * Storage choice: a single JSON file at
 * `data/processed/dataset-mode.json`. Rationale:
 *
 *   - No new Prisma table — Phase 10 ships zero migrations, matching
 *     the `CLAUDE.md` workflow rule.
 *   - Survives app restarts; lives outside `prisma/dev.db` so a
 *     `reset:demo` doesn't accidentally wipe the user's mode choice.
 *   - Tiny enough that we can parse + validate it on every read.
 *
 * Safe fallback: any I/O error or malformed JSON yields the default
 * state ({@link DEFAULT_DATASET_STATE}). The caller never receives a
 * thrown error — invariant: `readState()` always returns a usable
 * state object.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  DEFAULT_DATASET_STATE,
  isDatasetMode,
  type DatasetMode,
  type DatasetModeStateFile,
} from "@/features/dataset-modes";

const STATE_FILENAME = "dataset-mode.json";

export interface StoreOptions {
  /** Absolute path to the state file. Defaults to `<cwd>/data/processed/dataset-mode.json`. */
  path?: string;
}

export function statePathFor(options: StoreOptions = {}): string {
  return options.path ?? resolve(process.cwd(), "data", "processed", STATE_FILENAME);
}

/**
 * Read the persisted state. Falls back to the default on any failure
 * (missing file, malformed JSON, invalid mode). Never throws.
 */
export function readState(options: StoreOptions = {}): DatasetModeStateFile {
  const path = statePathFor(options);
  if (!existsSync(path)) return { ...DEFAULT_DATASET_STATE };
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<DatasetModeStateFile>;
    return normaliseState(parsed);
  } catch {
    return { ...DEFAULT_DATASET_STATE };
  }
}

/**
 * Atomically (well, as atomic as fs.writeFileSync gets on a single
 * machine) persist the new state. Creates the parent directory if
 * missing.
 */
export function writeState(
  state: DatasetModeStateFile,
  options: StoreOptions = {},
): void {
  const path = statePathFor(options);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const safeState = normaliseState(state);
  writeFileSync(path, `${JSON.stringify(safeState, null, 2)}\n`, "utf8");
}

/**
 * Validate + repair an unknown payload into a {@link DatasetModeStateFile}.
 * Exported so tests can exercise the corruption-recovery path without
 * touching the filesystem.
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
