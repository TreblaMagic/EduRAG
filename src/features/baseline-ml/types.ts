/**
 * Phase 8 — baseline prediction layer types.
 *
 * Mirrors the Phase 7 `CausalEngine` pattern: a stable
 * {@link PredictionEngine} interface that both the always-on TypeScript
 * baseline (logistic regression) and any optional future advanced
 * implementation (sklearn random forest via the Python worker) conform to.
 * The rest of the app — orchestrators, queries, UI — only talks to this
 * interface, so swapping models never reaches downstream code.
 *
 * **Honesty constraint (binding).** A `PredictionResult` is *not* an
 * intervention recommendation. The result type intentionally has no
 * `recommendedAction` field. Causal intervention lives in
 * `InterventionSimulation` (Phase 4) and is rendered side-by-side in the
 * Phase 8 comparison UI, never merged with prediction output.
 */

/** Names of the seven features the baseline model consumes per student. */
export const PREDICTION_FEATURE_NAMES = [
  "PriorGPA",
  "MeanEngagement",
  "MeanRdi",
  "ForumParticipation",
  "QuizConsistency",
  "AssessmentTrend",
  "MeanLoginsPerWeek",
] as const;

export type PredictionFeatureName = (typeof PREDICTION_FEATURE_NAMES)[number];

export type PredictionFeatureVector = Record<PredictionFeatureName, number>;

export type ModelType = "logistic" | "random_forest" | "gradient_boosting";

export type PredictionEngineName = "baseline" | "advanced";

export type RiskClass = "at-risk" | "borderline" | "on-track";

export type PredictionConfidence = "high" | "medium" | "low";

/** One row in the training matrix. */
export interface PredictionTrainingRow {
  studentId: string;
  courseId: string;
  features: PredictionFeatureVector;
  /** Observed final grade — the regression target. */
  finalGrade: number;
}

/** Shape persisted on `BaselinePrediction` for one (student, course, model). */
export interface PredictionResult {
  studentId: string;
  courseId: string;
  modelType: ModelType;
  /** P(at-risk = 1). */
  predictedRiskProb: number;
  /** Optional regression output; null when only classification was fit. */
  predictedGrade: number | null;
  riskClass: RiskClass;
  threshold: number;
  confidence: PredictionConfidence;
  /** Per-feature importance (signed for logistic, magnitudes for tree models). */
  featureImportance: FeatureImportance[];
  notes: string[];
  warnings: string[];
}

export interface FeatureImportance {
  feature: PredictionFeatureName;
  /** Raw contribution / coefficient (signed for linear models). */
  value: number;
  /** Magnitude — easier for the UI to bar-chart. */
  absValue: number;
  /** Optional one-line explanation surfaced in the UI. */
  description: string;
}

/** Model artefact produced by training; deterministic given a seed. */
export interface TrainedModel {
  modelType: ModelType;
  engine: PredictionEngineName;
  featureNames: ReadonlyArray<PredictionFeatureName>;
  /** Probability threshold used to call a row "at risk". */
  threshold: number;
  /** Number of training rows seen. */
  sampleSize: number;
  /** Wall-clock training duration. */
  durationMs: number;
  /** Mean log-loss on the training set after fitting. */
  trainLogLoss: number;
  /** Plain-classification accuracy on the training set (for sanity only). */
  trainAccuracy: number;
  /** Engine-specific payload — opaque to callers. */
  payload: unknown;
  notes: string[];
  warnings: string[];
}

export interface EngineTrainRequest {
  modelType: ModelType;
  rows: ReadonlyArray<PredictionTrainingRow>;
  /** Probability threshold to use when assigning the binary risk class. */
  threshold?: number;
  seed?: number;
  /** Pass through engine-specific hyperparameters (e.g. iterations, L2). */
  hyperparameters?: Record<string, number>;
}

export interface EnginePredictRequest {
  model: TrainedModel;
  rows: ReadonlyArray<PredictionTrainingRow>;
}

export interface PredictionEngine {
  readonly name: PredictionEngineName;
  available(): Promise<boolean>;
  train(req: EngineTrainRequest): Promise<TrainedModel>;
  predict(req: EnginePredictRequest): Promise<PredictionResult[]>;
}
