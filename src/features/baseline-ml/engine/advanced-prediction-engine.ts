/**
 * Phase 9 — advanced prediction engine (sklearn via the Python worker).
 *
 * Mirrors the Phase 7 `advancedEngine` pattern exactly: one-shot subprocess,
 * JSON in / JSON out, bundler-opaque Node loader so the client bundle
 * stays clean. Supports `logistic` and `random_forest` model types; the
 * baseline engine handles plain logistic locally so the only reason to
 * pick advanced is to get sklearn's RF (or the marginally different
 * lbfgs-fitted logistic).
 *
 * Graceful degradation: every failure throws; `selectPredictionEngine`
 * falls back to baseline with a structured warning.
 */

import {
  probePythonWorker,
  workerEntryPath,
} from "@/features/causal-engine/engine/availability";

import { AT_RISK_THRESHOLD } from "../constants";
import {
  PREDICTION_FEATURE_NAMES,
  type EnginePredictRequest,
  type EngineTrainRequest,
  type FeatureImportance,
  type PredictionConfidence,
  type PredictionEngine,
  type PredictionResult,
  type RiskClass,
  type TrainedModel,
} from "../types";

const SUBPROCESS_TIMEOUT_MS = 60_000;

interface WorkerEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  warnings?: string[];
}

interface TrainWorkerResult {
  modelType: string;
  method: string;
  trainAccuracy: number;
  trainLogLoss: number;
  sampleSize: number;
  featureImportance: FeatureImportance[];
  payload: AdvancedPayload;
  notes: string[];
}

interface InferWorkerResult {
  probabilities: number[];
  threshold: number;
}

interface AdvancedPayload {
  kind: "logistic" | "random_forest";
  featureNames: string[];
  scaler: { mean: number[]; std: number[] };
  threshold: number;
  coefficients?: number[];
  intercept?: number;
  /** Random-forest only: training-set probabilities returned by the worker. */
  trainProbabilities?: number[];
}

class AdvancedPredictionEngine implements PredictionEngine {
  readonly name = "advanced" as const;

  async available(): Promise<boolean> {
    const probe = await probePythonWorker();
    if (!probe.available) return false;
    try {
      const ping = await runWorker<{ pong: true; deps: Record<string, boolean> }>(
        "ping",
        {},
      );
      // Need at least numpy + sklearn for the advanced prediction path.
      const deps = ping.result?.deps ?? {};
      return ping.ok && Boolean(deps.numpy) && Boolean(deps.sklearn);
    } catch {
      return false;
    }
  }

  async train(req: EngineTrainRequest): Promise<TrainedModel> {
    if (req.modelType !== "logistic" && req.modelType !== "random_forest") {
      throw new Error(
        `Advanced engine supports "logistic" or "random_forest"; got "${req.modelType}".`,
      );
    }
    const threshold = req.threshold ?? 0.5;
    const start = Date.now();
    const envelope = await runWorker<TrainWorkerResult>("predict_train", {
      modelType: req.modelType,
      threshold,
      seed: req.seed ?? 42,
      featureNames: PREDICTION_FEATURE_NAMES,
      atRiskThreshold: AT_RISK_THRESHOLD,
      rows: req.rows.map((r) => ({
        studentId: r.studentId,
        courseId: r.courseId,
        features: r.features,
        finalGrade: r.finalGrade,
      })),
    });
    if (!envelope.ok || !envelope.result) {
      throw new Error(envelope.error ?? "advanced predict_train returned no result");
    }
    const r = envelope.result;
    return {
      modelType: req.modelType,
      engine: "advanced",
      featureNames: PREDICTION_FEATURE_NAMES,
      threshold,
      sampleSize: r.sampleSize,
      durationMs: Date.now() - start,
      trainLogLoss: r.trainLogLoss,
      trainAccuracy: r.trainAccuracy,
      payload: r.payload,
      notes: r.notes,
      warnings: envelope.warnings ?? [],
    };
  }

  async predict(req: EnginePredictRequest): Promise<PredictionResult[]> {
    const payload = req.model.payload as AdvancedPayload;
    if (!payload || !payload.kind) {
      throw new Error("advanced predict: malformed model payload");
    }

    const probabilities = await this.scoreRows(req, payload);
    const threshold = payload.threshold;
    return req.rows.map((row, i) => {
      const prob = probabilities[i] ?? 0;
      const cls: RiskClass =
        prob >= threshold ? "at-risk" : prob >= 0.3 ? "borderline" : "on-track";
      return {
        studentId: row.studentId,
        courseId: row.courseId,
        modelType: req.model.modelType,
        predictedRiskProb: roundProb(prob),
        predictedGrade: null,
        riskClass: cls,
        threshold,
        confidence: confidenceForProb(prob, threshold),
        featureImportance: req.model.payload
          ? (req.model.payload as { featureImportance?: FeatureImportance[] }).featureImportance ??
            inferImportanceFromPayload(payload)
          : [],
        notes: req.model.notes,
        warnings: req.model.warnings,
      };
    });
  }

  private async scoreRows(
    req: EnginePredictRequest,
    payload: AdvancedPayload,
  ): Promise<number[]> {
    if (payload.kind === "random_forest" && payload.trainProbabilities) {
      // Random forests aren't re-creatable from JSON; reuse the
      // train-time probabilities. Only valid when called on the same row
      // set used for training — the orchestrator guarantees this.
      if (payload.trainProbabilities.length === req.rows.length) {
        return payload.trainProbabilities;
      }
      throw new Error(
        "advanced predict: random_forest inference requires the same row set " +
          "used for training (the worker does not persist fitted forests).",
      );
    }
    const envelope = await runWorker<InferWorkerResult>("predict_infer", {
      modelPayload: payload,
      rows: req.rows.map((r) => ({
        studentId: r.studentId,
        courseId: r.courseId,
        features: r.features,
      })),
    });
    if (!envelope.ok || !envelope.result) {
      throw new Error(envelope.error ?? "advanced predict_infer returned no result");
    }
    return envelope.result.probabilities;
  }
}

export const advancedPredictionEngine: PredictionEngine = new AdvancedPredictionEngine();

// ---- helpers ---------------------------------------------------------------

function inferImportanceFromPayload(payload: AdvancedPayload): FeatureImportance[] {
  if (payload.kind === "logistic" && payload.coefficients) {
    return payload.featureNames.map((name, i) => {
      const value = payload.coefficients![i] ?? 0;
      return {
        feature: name as FeatureImportance["feature"],
        value: round4(value),
        absValue: round4(Math.abs(value)),
        description: `sklearn LogisticRegression coefficient β = ${round4(value)}.`,
      };
    });
  }
  return [];
}

function confidenceForProb(prob: number, threshold: number): PredictionConfidence {
  const margin = Math.abs(prob - threshold);
  if (margin >= 0.3) return "high";
  if (margin >= 0.15) return "medium";
  return "low";
}

function roundProb(p: number): number {
  return Math.round(p * 10000) / 10000;
}

function round4(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 10000) / 10000;
}

// ---- subprocess client (bundler-opaque Node loader) -----------------------

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

  return new Promise((resolveP, rejectP) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectP(new Error(`Python worker timeout after ${SUBPROCESS_TIMEOUT_MS}ms`));
    }, SUBPROCESS_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectP(
          new Error(
            `Python worker exited ${code}. stderr: ${stderr.trim() || "(empty)"}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as WorkerEnvelope<T>;
        resolveP(parsed);
      } catch (e) {
        rejectP(
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
