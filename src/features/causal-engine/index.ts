export {
  CAUSAL_NODES,
  CAUSAL_EDGES,
  BASELINE_ADJUSTERS,
  adjustmentSetFor,
  buildAdjacency,
  parentsOf,
  childrenOf,
  topologicalSort,
  isDag,
  toDagJson,
  type CausalNode,
  type CausalEdge,
  type NodeAdjacency,
  type DagJson,
} from "./dag";

export {
  toFeatureRow,
  buildFeatureTable,
  type FeatureRow,
  type FeatureVector,
  type RawFeatureSource,
} from "./feature-table";

export {
  estimateEffect,
  estimateEffectPoint,
  type EffectEstimate,
  type EstimatorOptions,
} from "./estimator";

export {
  runRefutations,
  type RefutationResult,
  type PlaceboResult,
  type RandomCommonCauseResult,
  type RefutationOptions,
} from "./refutation";

export {
  runExtendedRefutations,
  type ExtendedRefutationResult,
  type SubsetRobustnessResult,
  type BootstrapStabilityResult,
  type SensitivityResult,
  type OutcomePermutationResult,
  type ExtendedRefutationOptions,
} from "./refutation-extended";

export {
  runDiscovery,
  diffManualVsDiscovered,
  type DiscoveryResult,
  type DiscoveredEdge,
  type DagEdgeDiff,
  type DiscoveryOptions,
} from "./discovery";

export {
  conditionalIndependenceTest,
  partialCorrelation,
  fisherZPValue,
} from "./independence-tests";

export {
  STANDARD_INTERVENTIONS,
  computeCohortStats,
  simulateIntervention,
  simulateMultipleInterventions,
  rankRecommendedInterventions,
  type InterventionProposal,
  type CausalEstimateSummary,
  type CohortStats,
  type ConfidenceLevel,
  type SimulatedIntervention,
} from "./simulator";

export {
  baselineEngine,
  selectEngine,
  type CausalEngine,
  type EngineName,
  type EngineEstimateRequest,
  type EngineEstimateResult,
  type EngineDiscoverRequest,
  type EngineDiscoverResult,
} from "./engine";

export {
  renderMarkdownReport,
  renderJsonReport,
  type CausalReport,
  type ReportEstimate,
  type ReportCohortSummary,
  type ReportDiscoveryComparison,
  type ReportPredictionRow,
  type ReportPredictionSection,
  type ReportDatasetModeSection,
  type ReportTrackingRow,
  type ReportTrackingSection,
} from "./report";
