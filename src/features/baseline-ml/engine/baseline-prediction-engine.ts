/**
 * Phase 8 — TypeScript baseline prediction engine.
 *
 * Wraps {@link trainLogistic} + the {@link Standardiser} behind the stable
 * {@link PredictionEngine} contract. Logistic regression is the only
 * `modelType` implemented here; tree-based models (`random_forest`,
 * `gradient_boosting`) belong to the optional advanced (Python) engine
 * and throw with a clear "use --engine advanced" error if requested
 * against the baseline.
 *
 * No external dependencies — same posture as the Phase 7 baseline causal
 * engine.
 */

import { AT_RISK_THRESHOLD } from "../constants";
import {
  predictClass,
  predictProbability,
  trainLogistic,
  type LogisticModel,
} from "../logistic-regression";
import {
  fitStandardiser,
  standardiseMatrix,
  standardiseRow,
  type Standardiser,
} from "../standardise";
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

const DEFAULT_THRESHOLD = 0.5;

interface LogisticPayload {
  model: LogisticModel;
  standardiser: Standardiser;
  threshold: number;
}

class BaselinePredictionEngine implements PredictionEngine {
  readonly name = "baseline" as const;

  async available(): Promise<boolean> {
    return true;
  }

  async train(req: EngineTrainRequest): Promise<TrainedModel> {
    if (req.modelType !== "logistic") {
      throw new Error(
        `Baseline engine only supports modelType="logistic". Got "${req.modelType}". ` +
          `Use the advanced (Python) engine for tree-based models.`,
      );
    }
    const start = Date.now();
    const threshold = req.threshold ?? DEFAULT_THRESHOLD;
    const X = req.rows.map((r) => featuresToVector(r.features));
    const y = req.rows.map((r) => atRiskLabel(r.finalGrade));

    if (X.length === 0) {
      throw new Error("baseline train: no rows provided");
    }
    if (!y.includes(1) || !y.includes(0)) {
      throw new Error(
        `baseline train: training set has only one class (all ${y[0] === 1 ? "at-risk" : "on-track"}). Add more rows.`,
      );
    }

    const standardiser = fitStandardiser(X);
    const Xs = standardiseMatrix(standardiser, X);

    const hp = req.hyperparameters ?? {};
    const model = trainLogistic(Xs, y, {
      iterations: hp.iterations ?? 400,
      learningRate: hp.learningRate ?? 0.1,
      l2: hp.l2 ?? 0.01,
    });

    let correct = 0;
    for (let i = 0; i < Xs.length; i++) {
      const p = predictProbability(model, Xs[i]!);
      if (predictClass(p, threshold) === y[i]!) correct++;
    }
    const accuracy = correct / Xs.length;

    const warnings: string[] = [];
    if (!model.converged) {
      warnings.push(
        `Logistic regression did not converge in ${model.iterations} iterations (final ‖step‖ above tolerance). Coefficients may be unstable.`,
      );
    }

    const payload: LogisticPayload = { model, standardiser, threshold };

    return {
      modelType: "logistic",
      engine: "baseline",
      featureNames: PREDICTION_FEATURE_NAMES,
      threshold,
      sampleSize: req.rows.length,
      durationMs: Date.now() - start,
      trainLogLoss: model.finalLoss,
      trainAccuracy: accuracy,
      payload,
      notes: [
        "L2-regularised logistic regression fit via batch gradient descent.",
        "Probabilistic prediction: P(at-risk = 1) given LMS feature vector.",
        "Feature importance is the standardised coefficient β_j — it summarises predictive contribution, NOT causal effect.",
      ],
      warnings,
    };
  }

  async predict(req: EnginePredictRequest): Promise<PredictionResult[]> {
    const payload = req.model.payload as LogisticPayload;
    if (!payload || !payload.model || !payload.standardiser) {
      throw new Error("predict: trained model payload is missing or malformed");
    }
    const { model, standardiser, threshold } = payload;
    const importanceBase = importanceFromLogistic(model.coefficients);
    return req.rows.map((row) => {
      const x = standardiseRow(standardiser, featuresToVector(row.features));
      const prob = predictProbability(model, x);
      const cls = predictClass(prob, threshold);
      const risk: RiskClass = cls === 1 ? "at-risk" : prob >= 0.3 ? "borderline" : "on-track";
      return {
        studentId: row.studentId,
        courseId: row.courseId,
        modelType: req.model.modelType,
        predictedRiskProb: roundProb(prob),
        predictedGrade: null,
        riskClass: risk,
        threshold,
        confidence: confidenceForProb(prob, threshold),
        featureImportance: importanceBase,
        notes: [
          "Probabilistic risk score from the logistic baseline.",
          "Feature importance ≠ causal effect; the strongest predictor is not necessarily the best intervention target.",
        ],
        warnings: [],
      };
    });
  }
}

export const baselinePredictionEngine: PredictionEngine = new BaselinePredictionEngine();

// ---- helpers ---------------------------------------------------------------

export function featuresToVector(features: Record<string, number>): number[] {
  return PREDICTION_FEATURE_NAMES.map((n) => features[n] ?? 0);
}

export function atRiskLabel(finalGrade: number): 0 | 1 {
  return finalGrade < AT_RISK_THRESHOLD ? 1 : 0;
}

function importanceFromLogistic(coefficients: ReadonlyArray<number>): FeatureImportance[] {
  return PREDICTION_FEATURE_NAMES.map((name, i) => {
    const value = coefficients[i] ?? 0;
    const direction = value > 0 ? "raises predicted risk" : "lowers predicted risk";
    return {
      feature: name,
      value: round4(value),
      absValue: round4(Math.abs(value)),
      description: `Standardised coefficient β = ${round4(value)} — ${direction}.`,
    };
  }).sort((a, b) => b.absValue - a.absValue);
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
