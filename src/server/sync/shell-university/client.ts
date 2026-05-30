/**
 * Shell University client — two transports behind one interface.
 *
 *   - **direct**  reads the seeded JSON files from disk via the data store.
 *                 Default for `npm run sync:university` so the demo works
 *                 without a dev server running.
 *   - **http**    fetches the same data via the live Next.js route handlers.
 *                 Exercises the real network contract; matches the topology
 *                 a real Moodle/Canvas/Blackboard sync would take.
 */

import {
  buildEnvelope,
  readShellHealth,
  readShellSyncStatus,
} from "@/features/shell-university/data-store";
import type {
  ShellApiEnvelope,
  ShellEntity,
  ShellEntityShape,
  ShellHealth,
  ShellSyncStatus,
} from "@/features/shell-university/types";

export type ShellTransport = "direct" | "http";

export interface ShellClient {
  readonly transport: ShellTransport;
  readonly base: string;
  fetchEntity<K extends ShellEntity>(entity: K): Promise<ShellApiEnvelope<ShellEntityShape[K]>>;
  fetchHealth(): Promise<ShellHealth>;
  fetchSyncStatus(): Promise<ShellSyncStatus>;
}

export function createDirectClient(): ShellClient {
  return {
    transport: "direct",
    base: "(local file store)",
    async fetchEntity<K extends ShellEntity>(entity: K) {
      return buildEnvelope<K>(entity);
    },
    async fetchHealth() {
      return readShellHealth();
    },
    async fetchSyncStatus() {
      return readShellSyncStatus();
    },
  };
}

export function createHttpClient(base: string): ShellClient {
  const trimmed = base.replace(/\/+$/, "");
  const url = (path: string) => `${trimmed}/api/shell-university/${path}`;

  return {
    transport: "http",
    base: trimmed,
    async fetchEntity<K extends ShellEntity>(entity: K) {
      const res = await fetch(url(entity), { cache: "no-store" });
      if (!res.ok) {
        throw new ShellHttpError(entity, res.status, await safeBody(res));
      }
      return (await res.json()) as ShellApiEnvelope<ShellEntityShape[K]>;
    },
    async fetchHealth() {
      const res = await fetch(url("health"), { cache: "no-store" });
      if (!res.ok) throw new ShellHttpError("health", res.status, await safeBody(res));
      return (await res.json()) as ShellHealth;
    },
    async fetchSyncStatus() {
      const res = await fetch(url("sync-status"), { cache: "no-store" });
      if (!res.ok) throw new ShellHttpError("sync-status", res.status, await safeBody(res));
      return (await res.json()) as ShellSyncStatus;
    },
  };
}

export class ShellHttpError extends Error {
  constructor(
    public readonly resource: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`shell-university HTTP ${status} on ${resource}: ${body.slice(0, 200)}`);
    this.name = "ShellHttpError";
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
