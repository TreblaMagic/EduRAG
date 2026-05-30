export type {
  CheckGroup,
  CheckResult,
  CheckStatus,
  SetupSummary,
  StepResult,
  StepStatus,
} from "./types";

export { runSteps, type SetupStep, type RunStepsOptions } from "./steps";
export { runCommand, type CommandResult, type RunCommandOptions } from "./spawn";
export { buildSetupSteps, type BuildSetupStepsOptions } from "./setup-steps";
export {
  dbChecks,
  envChecks,
  dataChecks,
  featureChecks,
  type DbCheckOptions,
} from "./checks";
export {
  renderCheckGroups,
  renderCheckLine,
  renderStepLine,
  renderSetupSummary,
  isHealthy,
  countByStatus,
} from "./format";
