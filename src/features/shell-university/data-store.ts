/**
 * Shell University — file-backed data store.
 *
 * Reads the JSON files produced by `seed.ts` and serves them to:
 *   - the `/api/shell-university/*` Next.js route handlers
 *   - the direct-mode sync client (avoiding HTTP for the demo default)
 *
 * Caches parsed JSON in module scope; cache is invalidated on file mtime
 * change so `npm run shell:seed` is picked up without a server restart.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { SHELL_DATA_DIR } from "./seed";
import type {
  ShellApiEnvelope,
  ShellEntity,
  ShellEntityShape,
  ShellHealth,
  ShellSyncStatus,
} from "./types";

interface CacheEntry<T> {
  mtimeMs: number;
  data: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

export class ShellStoreNotSeededError extends Error {
  constructor(filePath: string) {
    super(
      `Shell University mock not seeded: ${filePath} is missing. ` +
        "Run `npm run shell:seed` first.",
    );
    this.name = "ShellStoreNotSeededError";
  }
}

function readJsonFile<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new ShellStoreNotSeededError(filePath);
  }
  const stat = statSync(filePath);
  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data as T;
  }
  const buffer = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(buffer) as T;
  cache.set(filePath, { mtimeMs: stat.mtimeMs, data: parsed });
  return parsed;
}

/** Read the seeded JSON array for an entity. */
export function readShellEntity<K extends ShellEntity>(
  entity: K,
  dir = SHELL_DATA_DIR,
): ShellEntityShape[K][] {
  return readJsonFile<ShellEntityShape[K][]>(resolve(dir, `${entity}.json`));
}

/** Read the mock health payload (with a server-recomputed uptime). */
export function readShellHealth(dir = SHELL_DATA_DIR): ShellHealth {
  const base = readJsonFile<ShellHealth>(resolve(dir, "_health.json"));
  return { ...base, uptime_seconds: Math.max(0, Math.floor(process.uptime())) };
}

export function readShellSyncStatus(dir = SHELL_DATA_DIR): ShellSyncStatus {
  return readJsonFile<ShellSyncStatus>(resolve(dir, "_sync-status.json"));
}

/** Whether any seeded data exists at all (cheap existence check). */
export function isShellStoreSeeded(dir = SHELL_DATA_DIR): boolean {
  return existsSync(resolve(dir, "students.json"));
}

/** Build a standard `{ data, meta }` envelope for an entity. */
export function buildEnvelope<K extends ShellEntity>(
  entity: K,
  dir = SHELL_DATA_DIR,
): ShellApiEnvelope<ShellEntityShape[K]> {
  const data = readShellEntity<K>(entity, dir);
  return {
    data,
    meta: {
      count: data.length,
      generated_at: new Date().toISOString(),
      source: "shell-university-mock",
      entity,
    },
  };
}
