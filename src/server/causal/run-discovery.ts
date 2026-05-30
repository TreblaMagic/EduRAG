/**
 * Phase 7 — run causal discovery for one course.
 *
 * Pulls the feature table, asks the selected engine to discover a DAG,
 * and diffs the result against the manually-encoded DAG. Always returns
 * structured output the UI can render — never throws on a "no edges
 * found" outcome; that itself is a meaningful result.
 */

import type { PrismaClient } from "@prisma/client";

import {
  buildFeatureTable,
  CAUSAL_EDGES,
  CAUSAL_NODES,
  diffManualVsDiscovered,
  selectEngine,
  type CausalEngine,
  type CausalNode,
  type DagEdgeDiff,
  type DiscoveredEdge,
  type EngineName,
} from "../../features/causal-engine";
import { log } from "../../lib/logger";

export interface DiscoveryRunResult {
  courseCode: string;
  algorithm: string;
  alpha: number;
  edges: DiscoveredEdge[];
  diff: DagEdgeDiff;
  independenceTests: number;
  warnings: string[];
  engineRequested: EngineName;
  engineResolved: EngineName;
  durationMs: number;
}

export interface RunDiscoveryOptions {
  engine?: EngineName;
  alpha?: number;
  seed?: number;
}

export async function runCausalDiscovery(
  prisma: PrismaClient,
  courseCode: string,
  options: RunDiscoveryOptions = {},
): Promise<DiscoveryRunResult> {
  const startedAt = Date.now();
  const requested = options.engine ?? "baseline";

  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) throw new Error(`Course not found: ${courseCode}`);

  const rows = await buildFeatureTable(prisma, course.id);
  if (rows.length === 0) {
    throw new Error(
      `No feature rows for course ${courseCode}. Run \`npm run db:ingest\` first.`,
    );
  }

  const selected = await selectEngine(requested);
  const engine: CausalEngine = selected.engine;
  if (!engine.discover) {
    throw new Error(
      `Engine ${selected.resolvedName} does not implement discovery.`,
    );
  }

  log.info(
    `Running discovery (${selected.resolvedName}) on ${rows.length} rows for ${courseCode}`,
  );
  const result = await engine.discover({
    rows,
    nodes: CAUSAL_NODES as readonly CausalNode[],
    alpha: options.alpha,
    seed: options.seed,
  });

  const manual = CAUSAL_EDGES.map((e) => ({ from: e.from, to: e.to }));
  const diff = diffManualVsDiscovered(manual, result.edges);

  return {
    courseCode,
    algorithm: result.algorithm,
    alpha: result.alpha,
    edges: result.edges,
    diff,
    independenceTests: result.independenceTests,
    warnings: [...result.warnings, ...selected.warnings],
    engineRequested: selected.requestedName,
    engineResolved: selected.resolvedName,
    durationMs: Date.now() - startedAt,
  };
}
