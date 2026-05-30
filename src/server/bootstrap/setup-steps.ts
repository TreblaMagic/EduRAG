/**
 * Phase 9 — concrete setup step list.
 *
 * Each step is idempotent: `shouldRun()` reads the filesystem / DB and
 * returns false when its desired post-condition already holds. That makes
 * `npm run setup` safe to re-run on an already-bootstrapped checkout —
 * it short-circuits the expensive parts and only does the work that's
 * actually missing.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { runCommand } from "./spawn";
import type { SetupStep } from "./steps";

const ROOT = process.cwd();

export interface BuildSetupStepsOptions {
  /** When true, regenerate the synthetic CSV even if it already exists. */
  freshData?: boolean;
  /** Inject row-count probes (used by tests + by the runner after migrations). */
  countStudents: () => Promise<number>;
  countEstimates: () => Promise<number>;
  countSimulations: () => Promise<number>;
  countPredictions: () => Promise<number>;
}

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

export function buildSetupSteps(options: BuildSetupStepsOptions): SetupStep[] {
  const csvPath = resolve(ROOT, "data", "raw", "sample_lms_data.csv");
  const dbPath = resolve(ROOT, "prisma", "dev.db");
  const nextModule = resolve(ROOT, "node_modules", "next");
  const prismaClient = resolve(ROOT, "node_modules", ".prisma", "client");

  return [
    {
      id: "deps",
      label: "Install npm dependencies",
      shouldRun: () => !existsSync(nextModule),
      run: async () => {
        await runCommand(NPM, ["install"]);
      },
      skipDetail: "node_modules already present",
      doneDetail: "npm install completed",
    },
    {
      id: "prisma-generate",
      label: "Generate Prisma client",
      shouldRun: () => !existsSync(prismaClient),
      run: async () => {
        await runCommand(NPX, ["prisma", "generate"]);
      },
      skipDetail: "Prisma client already present",
      doneDetail: "Prisma client generated",
    },
    {
      id: "migrate",
      label: "Apply Prisma migrations",
      shouldRun: () => !existsSync(dbPath),
      run: async () => {
        // `migrate deploy` is non-interactive and idempotent for
        // already-applied migrations — perfect for setup automation.
        await runCommand(NPX, ["prisma", "migrate", "deploy"]);
      },
      skipDetail: "SQLite database already exists",
      doneDetail: "Migrations applied",
    },
    {
      id: "data-generate",
      label: "Generate synthetic LMS dataset",
      shouldRun: () => options.freshData || !existsSync(csvPath),
      run: async () => {
        await runCommand(NPM, ["run", "data:generate"]);
      },
      skipDetail: "data/raw/sample_lms_data.csv already present",
      doneDetail: "Synthetic CSV generated",
    },
    {
      id: "ingest",
      label: "Ingest CSV + derive weekly / RDI / course features",
      shouldRun: async () => (await options.countStudents()) === 0,
      run: async () => {
        await runCommand(NPM, ["run", "db:ingest"]);
      },
      skipDetail: "students already present in the database",
      doneDetail: "CSV ingested + derivations written",
    },
    {
      id: "causal-estimate",
      label: "Run causal estimates (Phase 3)",
      shouldRun: async () => (await options.countEstimates()) === 0,
      run: async () => {
        await runCommand(NPM, ["run", "causal:estimate"]);
      },
      skipDetail: "CausalEstimate rows already present",
      doneDetail: "Cohort-level β estimates written",
    },
    {
      id: "causal-simulate",
      label: "Run intervention simulations (Phase 4)",
      shouldRun: async () => (await options.countSimulations()) === 0,
      run: async () => {
        await runCommand(NPM, ["run", "causal:simulate"]);
      },
      skipDetail: "InterventionSimulation rows already present",
      doneDetail: "Per-student counterfactual simulations written",
    },
    {
      id: "ml-predict",
      label: "Train + predict baseline ML layer (Phase 8)",
      shouldRun: async () => (await options.countPredictions()) === 0,
      run: async () => {
        await runCommand(NPM, ["run", "ml:predict"]);
      },
      skipDetail: "BaselinePrediction rows already present",
      doneDetail: "Logistic baseline trained + predictions persisted",
    },
  ];
}
