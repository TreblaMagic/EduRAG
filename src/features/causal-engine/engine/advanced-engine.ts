/**
 * Phase 7 — Python advanced engine.
 *
 * Calls the optional Python worker at `/python/causal-worker/worker.py` via
 * a one-shot subprocess. Protocol:
 *
 *   stdin:  JSON envelope { cmd: "estimate" | "discover" | "ping", payload: {...} }
 *   stdout: JSON envelope { ok: bool, result?: {...}, error?: "..." }
 *
 * No long-running process, no HTTP, no RPC framework. The cost of a spawn
 * (~150ms cold start on Windows, ~30ms warm) is negligible compared to a
 * DoWhy fit. Every payload is fully self-contained — the worker holds no
 * state between invocations.
 *
 * Graceful degradation: if the worker is absent, missing dependencies, or
 * returns an error, this engine throws. Callers are expected to fall back
 * to the baseline engine and surface a warning.
 *
 * **Bundle safety.** `node:child_process` is loaded inside the function via
 * a bundler-opaque `eval("require")` so this file remains importable from
 * code reachable by client components. See `availability.ts` for details.
 */

import type { CausalNode } from "../dag";
import { adjustmentSetFor } from "../dag";
import { probePythonWorker, workerEntryPath } from "./availability";
import type {
  CausalEngine,
  EngineDiscoverRequest,
  EngineDiscoverResult,
  EngineEstimateRequest,
  EngineEstimateResult,
} from "./types";

const SUBPROCESS_TIMEOUT_MS = 30_000;

interface WorkerEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  warnings?: string[];
}

interface EstimateWorkerResult {
  estimate: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  sampleSize: number;
  method: string;
  bootstrapIters: number;
  notes: string[];
}

interface DiscoverWorkerResult {
  algorithm: string;
  alpha: number;
  edges: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  independenceTests: number;
}

class AdvancedEngine implements CausalEngine {
  readonly name = "advanced" as const;

  async available(): Promise<boolean> {
    const probe = await probePythonWorker();
    if (!probe.available) return false;
    try {
      const ping = await runWorker<{ pong: true }>("ping", {});
      return ping.ok === true;
    } catch {
      return false;
    }
  }

  async estimate(req: EngineEstimateRequest): Promise<EngineEstimateResult> {
    const adjustment = req.adjustmentSet ?? adjustmentSetFor(req.treatment);
    const payload = {
      treatment: req.treatment,
      outcome: req.outcome,
      adjustmentSet: adjustment,
      bootstrapIters: req.bootstrapIters ?? 500,
      ciLevel: req.ciLevel ?? 0.95,
      seed: req.seed ?? 42,
      rows: req.rows.map((r) => ({
        studentId: r.studentId,
        courseId: r.courseId,
        features: r.features,
      })),
    };
    const envelope = await runWorker<EstimateWorkerResult>("estimate", payload);
    if (!envelope.ok || !envelope.result) {
      throw new Error(envelope.error ?? "advanced engine returned no result");
    }
    const r = envelope.result;
    return {
      treatment: req.treatment,
      outcome: req.outcome,
      adjustmentSet: adjustment,
      estimate: r.estimate,
      ciLow: r.ciLow,
      ciHigh: r.ciHigh,
      ciLevel: r.ciLevel,
      sampleSize: r.sampleSize,
      method: r.method,
      engine: "advanced",
      bootstrapIters: r.bootstrapIters,
      notes: r.notes,
      warnings: envelope.warnings ?? [],
    };
  }

  async discover(req: EngineDiscoverRequest): Promise<EngineDiscoverResult> {
    const payload = {
      nodes: req.nodes,
      alpha: req.alpha ?? 0.05,
      seed: req.seed ?? 42,
      rows: req.rows.map((r) => ({ features: r.features })),
    };
    const envelope = await runWorker<DiscoverWorkerResult>("discover", payload);
    if (!envelope.ok || !envelope.result) {
      throw new Error(envelope.error ?? "advanced engine discovery failed");
    }
    const r = envelope.result;
    return {
      algorithm: r.algorithm,
      alpha: r.alpha,
      edges: r.edges,
      independenceTests: r.independenceTests,
      warnings: envelope.warnings ?? [],
      engine: "advanced",
    };
  }
}

export const advancedEngine: CausalEngine = new AdvancedEngine();

// ---- internals -------------------------------------------------------------

async function runWorker<T>(
  cmd: string,
  payload: unknown,
): Promise<WorkerEnvelope<T>> {
  const probe = await probePythonWorker();
  if (!probe.available || !probe.interpreter) {
    throw new Error(probe.reason ?? "Python worker unavailable");
  }
  const cp = loadNode("child_process") as typeof import("node:child_process");
  const child = cp.spawn(probe.interpreter, [workerEntryPath()], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const envelope = JSON.stringify({ cmd, payload });

  return new Promise((resolve_, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Python worker timeout after ${SUBPROCESS_TIMEOUT_MS}ms`));
    }, SUBPROCESS_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `Python worker exited ${code}. stderr: ${stderr.trim() || "(empty)"}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as WorkerEnvelope<T>;
        resolve_(parsed);
      } catch (e) {
        reject(
          new Error(
            `Python worker emitted non-JSON output: ${stdout.slice(0, 200)} (${e})`,
          ),
        );
      }
    });

    child.stdin?.write(envelope);
    child.stdin?.end();
  });
}

function loadNode(name: string): unknown {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error(`Node-only module "${name}" requested in a non-Node runtime.`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req: NodeRequire = eval("require");
  return req(name);
}
